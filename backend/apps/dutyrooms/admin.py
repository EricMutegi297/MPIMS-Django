from django.contrib import admin

from .models import DutyRoster, DutyRosterAssignment, DutyRosterPost, OccurrenceBook, OccurrenceEntry


class DutyRosterPostInline(admin.TabularInline):
    model = DutyRosterPost
    extra = 0


@admin.register(DutyRoster)
class DutyRosterAdmin(admin.ModelAdmin):
    list_display = ("title", "part_one_order_sequence", "part_one_order_year", "battalion", "detachment", "status", "start_date", "end_date", "created_by")
    list_filter = ("status", "battalion", "detachment")
    search_fields = ("title", "created_by__name", "created_by__service_number")
    inlines = [DutyRosterPostInline]


@admin.register(DutyRosterPost)
class DutyRosterPostAdmin(admin.ModelAdmin):
    list_display = ("post_name", "roster", "duty_type", "required_personnel", "starts_at", "ends_at")
    list_filter = ("duty_type", "post_name")
    search_fields = ("post_name", "roster__title")


@admin.register(DutyRosterAssignment)
class DutyRosterAssignmentAdmin(admin.ModelAdmin):
    list_display = ("roster_post", "personnel", "assigned_at")
    search_fields = ("personnel__name", "personnel__service_number", "roster_post__post_name")


@admin.register(OccurrenceBook)
class OccurrenceBookAdmin(admin.ModelAdmin):
    list_display = ("date", "battalion", "detachment", "status", "opened_by")
    list_filter = ("status", "battalion", "detachment")


@admin.register(OccurrenceEntry)
class OccurrenceEntryAdmin(admin.ModelAdmin):
    list_display = ("book", "serial_no", "entry_type", "status", "recorded_by", "requires_investigation")
    list_filter = ("entry_type", "status", "requires_investigation")
    search_fields = ("description", "action_taken", "recorded_by__name", "recorded_by__service_number")
