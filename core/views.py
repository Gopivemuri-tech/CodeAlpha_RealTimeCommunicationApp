from urllib.parse import urlparse
from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required,user_passes_test
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404,redirect,render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST
from .forms import SignUpForm,MeetingScheduleForm
from .models import Meeting,Plan,Subscription,AuditLog
from .services import seed_defaults,ensure_subscription

def ip(req): return req.META.get('REMOTE_ADDR')
def signup_view(request):
    if request.user.is_authenticated:return redirect('dashboard')
    form=SignUpForm(request.POST or None)
    if request.method=='POST' and form.is_valid():
        user=form.save();seed_defaults();ensure_subscription(user);login(request,user);AuditLog.objects.create(user=user,action='register',ip_address=ip(request));return redirect('dashboard')
    return render(request,'registration/signup.html',{'form':form})
@login_required
def dashboard(request):
    seed_defaults();sub=ensure_subscription(request.user)
    return render(request,'core/dashboard.html',{'subscription':sub,'recent_meetings':Meeting.objects.filter(host=request.user)[:6]})
@login_required
@require_POST
def create_meeting(request):
    sub=ensure_subscription(request.user);title=request.POST.get('title','').strip() or 'NexaRoom Meeting'
    m=Meeting.objects.create(host=request.user,title=title,status='live',started_at=timezone.now(),duration_limit_minutes=sub.plan.meeting_minutes,max_participants=sub.plan.max_participants,allow_screen_share=sub.plan.screen_share,allow_whiteboard=sub.plan.whiteboard,allow_files=True)
    AuditLog.objects.create(user=request.user,action='meeting_create',detail=str(m.id),ip_address=ip(request));return redirect('meeting_room',meeting_id=m.id)
@login_required
@require_POST
def schedule_meeting(request):
    form=MeetingScheduleForm(request.POST)
    if form.is_valid():
        sub=ensure_subscription(request.user);m=Meeting.objects.create(host=request.user,title=form.cleaned_data['title'],status='scheduled',scheduled_for=form.cleaned_data['scheduled_for'],duration_limit_minutes=sub.plan.meeting_minutes,max_participants=sub.plan.max_participants,allow_screen_share=sub.plan.screen_share,allow_whiteboard=sub.plan.whiteboard,allow_files=True);messages.success(request,'Meeting scheduled.');return redirect('meeting_room',meeting_id=m.id)
    messages.error(request,'Please check the schedule details.');return redirect('dashboard')
@login_required
def join_meeting(request):
    raw=request.GET.get('invite','').strip()
    passcode=request.GET.get('passcode','').strip()
    room=raw
    fragment=''
    if raw.startswith('http'):
        try:
            parsed=urlparse(raw);fragment=parsed.fragment
            parts=[s for s in parsed.path.split('/') if s]
            room=parts[parts.index('meet')+1] if 'meet' in parts else ''
        except Exception: room=''
    clean=''.join(ch for ch in room if ch.isalnum() or ch=='-')
    m=None
    try: m=Meeting.objects.get(id=clean)
    except Exception:
        digits=''.join(ch for ch in room if ch.isdigit())
        if digits: m=Meeting.objects.filter(meeting_code=digits).first()
    if not m:
        messages.error(request,'Meeting not found. Check the invite link or Meeting ID.')
        return redirect('dashboard')
    if not raw.startswith('http') and m.passcode and passcode.upper()!=m.passcode.upper():
        messages.error(request,'Incorrect meeting passcode.')
        return redirect('dashboard')
    target=reverse('meeting_room',kwargs={'meeting_id':m.id})
    if fragment: target += '#'+fragment
    return redirect(target)
@login_required
def meeting_room(request,meeting_id):
    m=get_object_or_404(Meeting,id=meeting_id)
    if m.status=='ended':return render(request,'core/meeting_ended.html',{'meeting':m})
    if m.status=='scheduled' and m.scheduled_for and m.scheduled_for>timezone.now() and m.host_id!=request.user.id:return render(request,'core/waiting_room.html',{'meeting':m})
    if m.status=='scheduled':m.status='live';m.started_at=timezone.now();m.save(update_fields=['status','started_at'])
    return render(request,'core/meeting_room.html',{'meeting':m,'plan':ensure_subscription(request.user).plan,'is_host':m.host_id==request.user.id})
@login_required
def plans(request):
    seed_defaults();return render(request,'core/plans.html',{'plans':Plan.objects.filter(active=True),'subscription':ensure_subscription(request.user)})

@login_required
def buy_plan(request,plan_id):
    seed_defaults()
    plan=get_object_or_404(Plan,id=plan_id,active=True)
    current=ensure_subscription(request.user)
    return render(request,'core/buy_plan.html',{'plan':plan,'subscription':current})

@login_required
def meetings(request):
    return render(request,'core/meetings.html',{'hosted':Meeting.objects.filter(host=request.user),'joined':Meeting.objects.filter(participants__user=request.user).exclude(host=request.user).distinct()})
staff_required=user_passes_test(lambda u:u.is_active and u.is_staff)
@staff_required
def control_center(request):
    seed_defaults();stats={'users':User.objects.count(),'meetings':Meeting.objects.count(),'live':Meeting.objects.filter(status='live').count(),'subscriptions':Subscription.objects.filter(active=True).count()}
    return render(request,'control/dashboard.html',{'stats':stats,'plans':Plan.objects.all(),'live_meetings':Meeting.objects.filter(status='live')[:20],'recent_users':User.objects.order_by('-date_joined')[:10]})
@staff_required
@require_POST
def control_update_plan(request,plan_id):
    p=get_object_or_404(Plan,id=plan_id);mins=request.POST.get('meeting_minutes','').strip();p.meeting_minutes=int(mins) if mins else None;p.max_participants=max(2,int(request.POST.get('max_participants',p.max_participants)));p.max_file_mb=max(1,int(request.POST.get('max_file_mb',p.max_file_mb)));p.video_quality=request.POST.get('video_quality',p.video_quality);p.screen_share='screen_share' in request.POST;p.whiteboard='whiteboard' in request.POST;p.recording='recording' in request.POST;p.custom_branding='custom_branding' in request.POST;p.save();messages.success(request,f'{p.name} updated.');return redirect('control_center')
@staff_required
@require_POST
def control_assign_plan(request,user_id):
    u=get_object_or_404(User,id=user_id);p=get_object_or_404(Plan,id=request.POST.get('plan_id'));s=ensure_subscription(u);s.plan=p;s.save();return redirect('control_center')
@staff_required
@require_POST
def control_end_meeting(request,meeting_id):
    m=get_object_or_404(Meeting,id=meeting_id);m.status='ended';m.ended_at=timezone.now();m.save(update_fields=['status','ended_at']);return redirect('control_center')
