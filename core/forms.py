from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.utils import timezone
class SignUpForm(UserCreationForm):
    email=forms.EmailField(required=True)
    first_name=forms.CharField(max_length=50,required=True,label='Full name')
    class Meta:
        model=User; fields=['first_name','username','email','password1','password2']
    def save(self,commit=True):
        u=super().save(commit=False);u.email=self.cleaned_data['email']
        if commit:u.save()
        return u
class MeetingScheduleForm(forms.Form):
    title=forms.CharField(max_length=120,initial='NexaRoom Meeting')
    scheduled_for=forms.DateTimeField(widget=forms.DateTimeInput(attrs={'type':'datetime-local'}),input_formats=['%Y-%m-%dT%H:%M'])
    def clean_scheduled_for(self):
        v=self.cleaned_data['scheduled_for']
        if v<=timezone.now(): raise forms.ValidationError('Choose a future date and time.')
        return v
