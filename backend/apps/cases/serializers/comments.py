from rest_framework import serializers

from ..models import CaseComment


class CaseCommentSerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=CaseComment.objects.all(),
        required=False,
        allow_null=True,
    )
    author_name = serializers.SerializerMethodField()
    author_role = serializers.SerializerMethodField()

    class Meta:
        model = CaseComment
        fields = ["id", "parent", "body", "author_name", "author_role", "created_at"]
        read_only_fields = ["id", "author_name", "author_role", "created_at"]

    def get_author_name(self, obj):
        if not obj.author:
            return "Former user"
        return " ".join(part for part in (obj.author.rank, obj.author.name) if part).strip()

    def get_author_role(self, obj):
        return obj.author.get_role_display() if obj.author else "Former user"

    def validate_body(self, value):
        body = value.strip()
        if not body:
            raise serializers.ValidationError("Comment cannot be empty.")
        if len(body) > 5000:
            raise serializers.ValidationError("Comment cannot exceed 5000 characters.")
        return body
