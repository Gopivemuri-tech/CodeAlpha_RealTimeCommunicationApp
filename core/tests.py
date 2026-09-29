from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from .models import Plan,Meeting
from .services import seed_defaults,ensure_subscription
class BackendTests(TestCase):
 def setUp(self):
  seed_defaults();self.u=User.objects.create_user(username='gopi',password='StrongPass123!');ensure_subscription(self.u)
 def test_plans(self): self.assertEqual(Plan.objects.count(),3)
 def test_dashboard_requires_login(self): self.assertEqual(self.client.get(reverse('dashboard')).status_code,302)
 def test_create_meeting(self):
  self.client.login(username='gopi',password='StrongPass123!');r=self.client.post(reverse('create_meeting'),{'title':'Team Sync'});self.assertEqual(r.status_code,302);self.assertTrue(Meeting.objects.filter(host=self.u,title='Team Sync').exists())
 def test_schedule(self):
  self.client.login(username='gopi',password='StrongPass123!');future=(timezone.now()+timedelta(days=1)).strftime('%Y-%m-%dT%H:%M');self.client.post(reverse('schedule_meeting'),{'title':'Tomorrow','scheduled_for':future});self.assertTrue(Meeting.objects.filter(title='Tomorrow',status='scheduled').exists())


class NexaRoomMeetingCodeTests(TestCase):
    def setUp(self):
        seed_defaults()
        self.user=User.objects.create_user(username='roomuser',password='StrongPass123!')
        ensure_subscription(self.user)
        self.client.login(username='roomuser',password='StrongPass123!')

    def test_meeting_code_and_passcode_generated(self):
        self.client.post(reverse('create_meeting'),{'title':'Code Test'})
        m=Meeting.objects.get(host=self.user)
        self.assertEqual(len(m.meeting_code),11)
        self.assertEqual(len(m.passcode),6)

    def test_join_by_meeting_code_and_passcode(self):
        other=User.objects.create_user(username='hostx',password='StrongPass123!')
        ensure_subscription(other)
        m=Meeting.objects.create(host=other,title='Join Test',status='live',started_at=timezone.now())
        response=self.client.get(reverse('join_meeting'),{'invite':m.meeting_code_display,'passcode':m.passcode})
        self.assertEqual(response.status_code,302)
        self.assertIn(str(m.id),response['Location'])
