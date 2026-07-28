import re
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from apps.incidents.models import Incident
from apps.users.models import User
from .models import DutyRoster, DutyRosterPost, OccurrenceBook, OccurrenceEntry


MIN_REST_PERIOD = timedelta(hours=24)
CONFLICT_STATUSES = [
    DutyRoster.Status.DRAFT,
    DutyRoster.Status.PENDING_APPROVAL,
    DutyRoster.Status.RETURNED,
    DutyRoster.Status.APPROVED,
    DutyRoster.Status.PUBLISHED,
]

RANK_ABBREVIATIONS = {
    "lieutenant colonel": "Lt Col",
    "colonel": "Col",
    "major": "Maj",
    "captain": "Capt",
    "lieutenant": "Lt",
    "second lieutenant": "2Lt",
}


def user_label(user):
    if not user:
        return None
    rank = f"{user.rank} " if user.rank else ""
    return f"{rank}{user.name} ({user.service_number})"


def rank_name(user):
    if not user:
        return None
    rank_value = (user.rank or "").strip()
    rank = f"{RANK_ABBREVIATIONS.get(rank_value.lower(), rank_value)} " if rank_value else ""
    return f"{rank}{user.name}".strip()


def duty_time_label(value):
    if not value:
        return "--"
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def normalize_post_name(value):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower()).split())


class DutyRosterPostSerializer(serializers.ModelSerializer):
    assigned_personnel = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        many=True,
        required=False,
    )
    assigned_personnel_details = serializers.SerializerMethodField()
    assigned_count = serializers.SerializerMethodField()
    is_filled = serializers.SerializerMethodField()
    shortfall = serializers.SerializerMethodField()

    class Meta:
        model = DutyRosterPost
        fields = [
            "id",
            "post_name",
            "duty_type",
            "starts_at",
            "ends_at",
            "required_personnel",
            "assigned_personnel",
            "assigned_personnel_details",
            "assigned_count",
            "is_filled",
            "shortfall",
            "notes",
        ]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and starts_at >= ends_at:
            raise serializers.ValidationError({"ends_at": "Duty end time must be after start time."})
        if attrs.get("required_personnel", getattr(self.instance, "required_personnel", 1)) < 1:
            raise serializers.ValidationError({"required_personnel": "Required personnel must be at least 1."})
        return attrs

    def get_assigned_personnel_details(self, obj):
        return [
            {
                "id": user.id,
                "label": user_label(user),
                "service_number": user.service_number,
                "rank": user.rank,
                "name": user.name,
                "email": user.email,
            }
            for user in obj.assigned_personnel.all()
        ]

    def get_assigned_count(self, obj):
        return obj.assigned_count

    def get_is_filled(self, obj):
        return obj.is_filled

    def get_shortfall(self, obj):
        return max(obj.required_personnel - obj.assigned_count, 0)


class DutyRosterSerializer(serializers.ModelSerializer):
    posts = DutyRosterPostSerializer(many=True, required=False)
    created_by_name = serializers.SerializerMethodField()
    forwarded_to_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    published_by_name = serializers.SerializerMethodField()
    part_one_order_serial = serializers.SerializerMethodField()
    previous_part_one_order = serializers.SerializerMethodField()
    battalion_name = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    unit_label = serializers.SerializerMethodField()
    commanding_officer_name = serializers.SerializerMethodField()
    is_complete = serializers.SerializerMethodField()
    post_count = serializers.SerializerMethodField()
    assigned_count = serializers.SerializerMethodField()

    class Meta:
        model = DutyRoster
        fields = [
            "id",
            "title",
            "battalion",
            "battalion_name",
            "detachment",
            "detachment_name",
            "unit_label",
            "commanding_officer_name",
            "part_one_order_year",
            "part_one_order_sequence",
            "part_one_order_serial",
            "previous_part_one_order",
            "start_date",
            "end_date",
            "status",
            "part_one_order_year",
            "part_one_order_sequence",
            "created_by",
            "created_by_name",
            "forwarded_to",
            "forwarded_to_name",
            "forwarded_at",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "approval_note",
            "returned_reason",
            "declined_reason",
            "published_by",
            "published_by_name",
            "published_at",
            "posts",
            "is_complete",
            "post_count",
            "assigned_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "created_by",
            "forwarded_at",
            "approved_by",
            "approved_at",
            "published_by",
            "published_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({"end_date": "Part 1 Orders end date cannot be before start date."})
        posts_data = attrs.get("posts")
        if posts_data is not None:
            conflicts = self._assignment_conflicts(posts_data)
            if conflicts:
                raise serializers.ValidationError({"posts": conflicts})
        return attrs

    def create(self, validated_data):
        posts_data = validated_data.pop("posts", [])
        roster = DutyRoster.objects.create(**validated_data)
        self._replace_posts(roster, posts_data)
        return roster

    def update(self, instance, validated_data):
        posts_data = validated_data.pop("posts", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if posts_data is not None:
            instance.posts.all().delete()
            self._replace_posts(instance, posts_data)
        return instance

    def _replace_posts(self, roster, posts_data):
        for post_data in posts_data:
            assigned = post_data.pop("assigned_personnel", [])
            post = DutyRosterPost.objects.create(roster=roster, **post_data)
            if assigned:
                post.assigned_personnel.set(assigned)

    def _assignment_conflicts(self, posts_data):
        assignments = []
        for index, post_data in enumerate(posts_data, start=1):
            starts_at = post_data.get("starts_at")
            ends_at = post_data.get("ends_at")
            if not starts_at or not ends_at:
                continue
            for user in post_data.get("assigned_personnel", []):
                assignments.append({
                    "user": user,
                    "post_name": post_data.get("post_name") or f"Post {index}",
                    "starts_at": starts_at,
                    "ends_at": ends_at,
                    "index": index,
                })

        conflicts = self._same_roster_conflicts(assignments)
        conflicts.extend(self._existing_roster_conflicts(assignments))
        return conflicts[:12]

    def _same_roster_conflicts(self, assignments):
        conflicts = []
        for left_index, left in enumerate(assignments):
            for right in assignments[left_index + 1:]:
                if left["user"].id != right["user"].id:
                    continue
                conflict = self._conflict_message(left, right)
                if conflict:
                    conflicts.append(conflict)
        return conflicts

    def _existing_roster_conflicts(self, assignments):
        conflicts = []
        base_qs = DutyRosterPost.objects.select_related("roster").prefetch_related("assigned_personnel").filter(
            roster__status__in=CONFLICT_STATUSES,
        )
        if self.instance:
            base_qs = base_qs.exclude(roster_id=self.instance.id)

        for assignment in assignments:
            user = assignment["user"]
            overlapping = (
                base_qs.filter(
                    assigned_personnel=user,
                    starts_at__lt=assignment["ends_at"],
                    ends_at__gt=assignment["starts_at"],
                )
                .order_by("starts_at")
                .first()
            )
            if overlapping:
                conflicts.append(
                    f"{user_label(user)} is already assigned to {overlapping.post_name} on "
                    f"{overlapping.roster.title} from {duty_time_label(overlapping.starts_at)} to "
                    f"{duty_time_label(overlapping.ends_at)}."
                )
                continue

            rest_window_start = assignment["starts_at"] - MIN_REST_PERIOD
            rest_window_end = assignment["ends_at"] + MIN_REST_PERIOD
            adjacent = (
                base_qs.filter(assigned_personnel=user)
                .filter(
                    Q(ends_at__lte=assignment["starts_at"], ends_at__gt=rest_window_start)
                    | Q(starts_at__gte=assignment["ends_at"], starts_at__lt=rest_window_end)
                )
                .order_by("starts_at")
                .first()
            )
            if adjacent:
                if normalize_post_name(adjacent.post_name) == normalize_post_name(assignment["post_name"]):
                    continue
                conflicts.append(
                    f"{user_label(user)} must have at least 24 hours rest between {adjacent.post_name} "
                    f"on {adjacent.roster.title} and {assignment['post_name']} on these Part 1 Orders."
                )
        return conflicts

    def _conflict_message(self, left, right):
        if left["starts_at"] < right["ends_at"] and right["starts_at"] < left["ends_at"]:
            return (
                f"{user_label(left['user'])} is assigned to {left['post_name']} and {right['post_name']} "
                f"at overlapping times."
            )

        earlier, later = (left, right) if left["ends_at"] <= right["starts_at"] else (right, left)
        gap = later["starts_at"] - earlier["ends_at"]
        if timedelta(0) <= gap < MIN_REST_PERIOD:
            if normalize_post_name(earlier["post_name"]) == normalize_post_name(later["post_name"]):
                return ""
            return (
                f"{user_label(left['user'])} must have at least 24 hours rest between "
                f"{earlier['post_name']} ending {duty_time_label(earlier['ends_at'])} and "
                f"{later['post_name']} starting {duty_time_label(later['starts_at'])}."
            )
        return ""

    def get_created_by_name(self, obj):
        return user_label(obj.created_by)

    def get_forwarded_to_name(self, obj):
        return user_label(obj.forwarded_to)

    def get_approved_by_name(self, obj):
        return user_label(obj.approved_by)

    def get_published_by_name(self, obj):
        return user_label(obj.published_by)

    def get_part_one_order_serial(self, obj):
        return self._part_one_order_serial(obj)

    def get_previous_part_one_order(self, obj):
        if not obj.part_one_order_year or not obj.part_one_order_sequence:
            return None
        previous = (
            self._serial_scope(obj)
            .exclude(status=DutyRoster.Status.DRAFT)
            .filter(
                part_one_order_year=obj.part_one_order_year,
                part_one_order_sequence__lt=obj.part_one_order_sequence,
            )
            .order_by("-part_one_order_sequence", "-start_date", "-created_at", "-id")
            .first()
        )
        if not previous:
            return None
        return {
            "id": previous.id,
            "title": previous.title,
            "serial": self._part_one_order_serial(previous),
            "start_date": previous.start_date.isoformat() if previous.start_date else None,
        }

    def _part_one_order_serial(self, obj):
        if not obj.part_one_order_year or not obj.part_one_order_sequence:
            return None
        return f"{obj.part_one_order_sequence:02d}/{obj.part_one_order_year % 100:02d}"

    def _serial_scope(self, obj):
        battalion = obj.battalion or getattr(obj.detachment, "battalion", None)
        qs = DutyRoster.objects.all()
        if battalion:
            return qs.filter(Q(battalion=battalion) | Q(detachment__battalion=battalion))
        return qs.filter(battalion__isnull=True, detachment__isnull=True)

    def get_battalion_name(self, obj):
        return obj.battalion.name if obj.battalion else None

    def get_detachment_name(self, obj):
        return obj.detachment.name if obj.detachment else None

    def get_unit_label(self, obj):
        return obj.unit_label

    def get_commanding_officer_name(self, obj):
        battalion = obj.battalion or getattr(obj.detachment, "battalion", None)
        if not battalion:
            return None
        co = (
            User.objects.filter(role=User.Role.CO, battalion=battalion, is_active=True)
            .order_by("name")
            .first()
        )
        return rank_name(co)

    def get_is_complete(self, obj):
        return obj.is_complete

    def get_post_count(self, obj):
        return obj.posts.count()

    def get_assigned_count(self, obj):
        return sum(post.assigned_count for post in obj.posts.all())


class OccurrenceBookSerializer(serializers.ModelSerializer):
    battalion_name = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()

    class Meta:
        model = OccurrenceBook
        fields = [
            "id",
            "date",
            "battalion",
            "battalion_name",
            "detachment",
            "detachment_name",
            "status",
            "opened_by",
            "closed_by",
            "closed_at",
            "created_at",
        ]
        read_only_fields = ["opened_by", "closed_by", "closed_at", "created_at"]

    def get_battalion_name(self, obj):
        return obj.battalion.name if obj.battalion else None

    def get_detachment_name(self, obj):
        return obj.detachment.name if obj.detachment else None


class OccurrenceEntrySerializer(serializers.ModelSerializer):
    book_date = serializers.SerializerMethodField()
    battalion_name = serializers.SerializerMethodField()
    detachment_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    linked_incident_number = serializers.SerializerMethodField()

    class Meta:
        model = OccurrenceEntry
        fields = [
            "id",
            "book",
            "book_date",
            "serial_no",
            "occurred_at",
            "entry_type",
            "road_traffic_type",
            "injured_count",
            "dead_count",
            "injury_severity",
            "incident_title",
            "place",
            "service_vehicle",
            "unit_involved",
            "originating_unit",
            "civilian",
            "service_member",
            "description",
            "history",
            "injuries",
            "damages",
            "how_occurred",
            "action_taken",
            "police_ob_reference",
            "recorded_by",
            "recorded_by_name",
            "requires_investigation",
            "status",
            "linked_incident",
            "linked_incident_number",
            "battalion_name",
            "detachment_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "book",
            "serial_no",
            "recorded_by",
            "originating_unit",
            "status",
            "linked_incident",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        requires_investigation = attrs.get(
            "requires_investigation",
            getattr(self.instance, "requires_investigation", False),
        )
        entry_type = attrs.get("entry_type", getattr(self.instance, "entry_type", OccurrenceEntry.EntryType.ROUTINE))
        road_traffic_type = attrs.get("road_traffic_type", getattr(self.instance, "road_traffic_type", ""))
        injured_count = attrs.get("injured_count", getattr(self.instance, "injured_count", None))
        dead_count = attrs.get("dead_count", getattr(self.instance, "dead_count", None))
        injury_severity = attrs.get("injury_severity", getattr(self.instance, "injury_severity", ""))
        incident_title = attrs.get("incident_title", getattr(self.instance, "incident_title", ""))
        place = attrs.get("place", getattr(self.instance, "place", ""))
        errors = {}
        if entry_type == OccurrenceEntry.EntryType.ROAD_TRAFFIC_ACCIDENT:
            attrs["requires_investigation"] = True
            requires_investigation = True
            if not str(road_traffic_type or "").strip():
                errors["road_traffic_type"] = "Select the road traffic accident type."
            elif not str(incident_title or "").strip():
                incident_title = dict(OccurrenceEntry.RoadTrafficType.choices).get(road_traffic_type, "")
                attrs["incident_title"] = incident_title
            if road_traffic_type == OccurrenceEntry.RoadTrafficType.INJURY:
                if not injured_count or injured_count < 1:
                    errors["injured_count"] = "Enter the number of injured persons."
                if not str(injury_severity or "").strip():
                    errors["injury_severity"] = "Select injury severity."
                attrs["dead_count"] = None
            elif road_traffic_type == OccurrenceEntry.RoadTrafficType.FATAL:
                if not dead_count or dead_count < 1:
                    errors["dead_count"] = "Enter the number of dead persons."
                attrs["injured_count"] = None
                attrs["injury_severity"] = ""
            else:
                attrs["injured_count"] = None
                attrs["dead_count"] = None
                attrs["injury_severity"] = ""
        else:
            attrs["road_traffic_type"] = ""
            attrs["injured_count"] = None
            attrs["dead_count"] = None
            attrs["injury_severity"] = ""

        if requires_investigation:
            if not str(incident_title or "").strip():
                errors["incident_title"] = "Incident is required when an OB entry requires investigation."
            if not str(place or "").strip():
                errors["place"] = "Place is required when an OB entry requires investigation."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def get_book_date(self, obj):
        return obj.book.date if obj.book else None

    def get_battalion_name(self, obj):
        return obj.book.battalion.name if obj.book and obj.book.battalion else None

    def get_detachment_name(self, obj):
        return obj.book.detachment.name if obj.book and obj.book.detachment else None

    def get_recorded_by_name(self, obj):
        return user_label(obj.recorded_by)

    def get_linked_incident_number(self, obj):
        return obj.linked_incident.incident_number if obj.linked_incident else None


class OccurrenceToIncidentSerializer(serializers.Serializer):
    incident_type = serializers.CharField(required=False, allow_blank=True)
    severity = serializers.ChoiceField(choices=Incident.Severity.choices, default=Incident.Severity.MEDIUM)
    location = serializers.CharField(required=False, allow_blank=True)
