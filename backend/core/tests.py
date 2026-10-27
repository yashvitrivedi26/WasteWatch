import os
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Ward, Team, Profile, Report, Batch

User = get_user_model()

class WasteWatchAPITests(APITestCase):
    def setUp(self):
        # 1. Ward
        self.ward = Ward.objects.create(
            name="Ward 1",
            code="W1",
            city="Bhavnagar",
            center_lat=21.7645,
            center_lng=72.1519,
            radius_km=10.0
        )

        # 2. Team
        self.team = Team.objects.create(
            name="Alpha Team",
            ward=self.ward
        )

        # 3. Citizen User
        self.citizen_user = User.objects.create_user(
            username="citizen_user",
            password="password123"
        )
        Profile.objects.update_or_create(user=self.citizen_user, defaults={"role": "citizen"})

        # 4. Officer User
        self.officer_user = User.objects.create_user(
            username="officer_user",
            password="password123",
            is_staff=True
        )
        Profile.objects.update_or_create(
            user=self.officer_user,
            defaults={"role": "officer", "ward": self.ward}
        )

        # 5. Worker User
        self.worker_user = User.objects.create_user(
            username="worker_user",
            password="password123",
            is_staff=True
        )
        Profile.objects.update_or_create(
            user=self.worker_user,
            defaults={"role": "worker", "team": self.team}
        )

        # 6. Sample photo
        sample_dir = os.path.join(settings.BASE_DIR, '..', 'docs', 'sample_photos')
        sample_file_path = None
        if os.path.exists(sample_dir):
            photos = [f for f in os.listdir(sample_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
            if photos:
                sample_file_path = os.path.join(sample_dir, photos[0])

        if sample_file_path and os.path.exists(sample_file_path):
            with open(sample_file_path, 'rb') as f:
                self.photo_content = f.read()
        else:
            self.photo_content = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'

    def get_test_photo(self):
        return SimpleUploadedFile(
            name="test_dump.jpg",
            content=self.photo_content,
            content_type="image/jpeg"
        )

    # a) Citizen can POST /api/reports with photo + lat/lng inside ward -> 201 and code "WW-..."
    def test_citizen_can_create_report(self):
        self.client.force_authenticate(user=self.citizen_user)
        data = {
            'photo': self.get_test_photo(),
            'lat': 21.7645,
            'lng': 72.1519,
            'note': 'Trash piled up near park'
        }
        response = self.client.post('/api/reports', data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('code', response.data)
        self.assertTrue(response.data['code'].startswith('WW-'))

    # b) Staff cannot create citizen reports -> 403
    def test_staff_cannot_create_citizen_report(self):
        data = {'photo': self.get_test_photo(), 'lat': 21.7645, 'lng': 72.1519}
        self.client.force_authenticate(user=self.officer_user)
        self.assertEqual(self.client.post('/api/reports', data, format='multipart').status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.worker_user)
        self.assertEqual(self.client.post('/api/reports', data, format='multipart').status_code, status.HTTP_403_FORBIDDEN)

    # c) Emergency request: without reason -> 400; with reason -> emergency_status "pending" & is_emergency False
    def test_emergency_report_validation(self):
        self.client.force_authenticate(user=self.citizen_user)

        # Without reason -> 400
        res_fail = self.client.post('/api/reports', {
            'photo': self.get_test_photo(),
            'lat': 21.7645,
            'lng': 72.1519,
            'emergency_request': 'true',
            'emergency_reason': ''
        }, format='multipart')
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)

        # With reason -> 201
        res_success = self.client.post('/api/reports', {
            'photo': self.get_test_photo(),
            'lat': 21.7645,
            'lng': 72.1519,
            'emergency_request': 'true',
            'emergency_reason': 'Hospital main entrance blocked completely'
        }, format='multipart')
        self.assertEqual(res_success.status_code, status.HTTP_201_CREATED)

        report = Report.objects.get(code=res_success.data['code'])
        self.assertEqual(report.emergency_status, 'pending')
        self.assertFalse(report.is_emergency)

    # d) Officer POST /api/officer/batches: past deadline -> 400; future deadline -> 201
    def test_officer_batches_deadline_validation(self):
        self.client.force_authenticate(user=self.officer_user)

        # Create a new report in this ward so batch has valid report targets
        rep = Report.objects.create(
            ward=self.ward,
            lat=21.7645,
            lng=72.1519,
            status='new',
            level='medium'
        )

        # Past deadline -> 400
        past_deadline = (timezone.now() - timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
        res_past = self.client.post('/api/officer/batches', {
            'team': self.team.id,
            'reports': [rep.id],
            'deadline': past_deadline
        }, format='json')
        self.assertEqual(res_past.status_code, status.HTTP_400_BAD_REQUEST)

        # Future deadline -> 201
        future_deadline = (timezone.now() + timedelta(days=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
        res_future = self.client.post('/api/officer/batches', {
            'team': self.team.id,
            'reports': [rep.id],
            'deadline': future_deadline
        }, format='json')
        self.assertEqual(res_future.status_code, status.HTTP_201_CREATED)

    # e) GET /api/track/WW-0000-9999 -> 404
    def test_track_invalid_code_returns_404(self):
        response = self.client.get('/api/track/WW-0000-9999')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
