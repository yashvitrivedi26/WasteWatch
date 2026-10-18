from rest_framework import serializers

from ml import ward

from .models import Block, Report, Task
from .photo_ai import classify_photo


class ReportSerializer(serializers.ModelSerializer):
    block = serializers.SlugRelatedField(slug_field="code", read_only=True)

    class Meta:
        model = Report
        fields = ["id", "block", "photo", "lat", "lng", "size", "type", "ai_label", "created_at"]
        read_only_fields = ["ai_label", "created_at"]

    def validate(self, data):
        cell = ward.locate(data["lat"], data["lng"])
        if cell is None:
            raise serializers.ValidationError("This location is outside the ward. Pick a spot on the map.")
        data["block"] = Block.objects.get(row=cell[0], col=cell[1])
        return data

    def create(self, data):
        data["ai_label"] = classify_photo(data["photo"])["label"]
        return super().create(data)


class TaskSerializer(serializers.ModelSerializer):
    block = serializers.SlugRelatedField(slug_field="code", queryset=Block.objects.all())
    team = serializers.ChoiceField(choices=ward.TEAMS)
    risk = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ["id", "block", "team", "status", "before_photo", "after_photo", "created_at", "cleared_at", "risk"]
        read_only_fields = ["before_photo", "created_at", "cleared_at"]

    def get_risk(self, task):
        score = task.block.risk_scores.first()
        return {"prob": score.prob, "reasons": score.reasons} if score else None
