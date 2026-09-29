# NexaRoom — Real-Time Communication & Collaboration Platform

**NexaRoom** is a full-stack real-time meeting and collaboration platform built with **Django, MySQL, WebRTC, Socket.IO, HTML, CSS, and JavaScript**.

The project was developed as part of the **CodeAlpha Full Stack Development Internship — Task 4: Real-Time Communication App**.

NexaRoom provides a professional meeting experience with video/audio communication, screen sharing, live chat, collaborative whiteboard, encrypted file sharing, meeting controls, subscription plans, and administrative management.

---

## Project Overview

NexaRoom is designed as a Zoom-style communication platform where authenticated users can create or join meetings and collaborate in real time.

The current V7 release focuses on a cleaner professional interface while preserving the complete V6 backend, database, WebRTC, Socket.IO, meeting-control, and subscription functionality.

---

## Key Features

- Real-time multi-user video and audio communication
- Create, join, and schedule meetings
- Shareable meeting invitation links
- Meeting ID and passcode support
- Screen sharing
- Live meeting chat
- Participant management
- Reactions
- Collaborative whiteboard
- AES-GCM encrypted file sharing
- Host controls
- Co-host support
- Meeting lock/unlock controls
- Local browser recording
- Live captions where browser support is available
- Meeting notes with text download
- Camera and microphone settings
- User authentication
- Free, Pro, and Business plans
- Checkout interface prepared for future payment-gateway integration
- NexaRoom Control Center
- Customized Django Admin
- Responsive professional V7 interface

---

## Host Controls

Meeting hosts can:

- Mute all participants
- Lock or unlock a meeting
- Enable or disable participant chat
- Enable or disable participant screen sharing
- Control participant unmute permissions
- Control participant video permissions
- Promote a participant to co-host
- Remove participants
- End the meeting for everyone

---

## Technology Stack

| Area | Technology |
| --- | --- |
| Backend | Python, Django |
| Database | MySQL |
| Real-Time Signaling | Python Socket.IO |
| Video & Audio | WebRTC |
| Frontend | HTML5, CSS3, JavaScript |
| Whiteboard | HTML Canvas + Socket.IO |
| File Security | AES-GCM Encryption |
| Authentication | Django Authentication |
| ASGI | Daphne, Channels |
| UI | Custom Responsive Interface |

---

## Project Structure

```text
NexaRoom/
│
├── core/
│   ├── management/
│   ├── migrations/
│   ├── admin.py
│   ├── apps.py
│   ├── forms.py
│   ├── models.py
│   ├── realtime.py
│   ├── services.py
│   ├── urls.py
│   └── views.py
│
├── nexaroom/
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
│
├── static/
│   ├── css/
│   ├── img/
│   └── js/
│
├── templates/
│   ├── admin/
│   ├── control/
│   ├── core/
│   └── registration/
│
├── .env.example
├── .gitignore
├── manage.py
├── requirements.txt
└── README.md
```

---

## Local Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd CodeAlpha_RealTimeCommunicationApp
```

### 2. Create a virtual environment

```powershell
python -m venv venv
```

### 3. Activate the environment

```powershell
venv\Scripts\activate
```

### 4. Install dependencies

```powershell
pip install -r requirements.txt
```

### 5. Create the environment file

```powershell
copy .env.example .env
```

Open `.env` and configure your MySQL credentials.

Example:

```env
DJANGO_SECRET_KEY=replace-with-your-own-secret-key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=nexaroom
MYSQL_USER=root
MYSQL_PASSWORD=YOUR_MYSQL_PASSWORD

NEXAROOM_ADMIN_USERNAME=admin
NEXAROOM_ADMIN_EMAIL=admin@nexaroom.local
NEXAROOM_ADMIN_PASSWORD=CHANGE_THIS_PASSWORD
```

> Do not upload your real `.env` file, database password, secret key, or production credentials to GitHub.

### 6. Initialize the application

Make sure MySQL is running, then execute:

```powershell
python manage.py setup_nexaroom
```

This command creates the `nexaroom` database when required, runs migrations, seeds the default application data, and creates the local administrator account configured in `.env`.

### 7. Verify the project

```powershell
python manage.py check
```

### 8. Start the application

```powershell
python manage.py runserver
```

Open:

```text
http://127.0.0.1:8000/
```

Control Center:

```text
http://127.0.0.1:8000/control/
```

Django Admin:

```text
http://127.0.0.1:8000/admin/
```

---

## Testing a Real-Time Meeting

For a two-user local test:

1. Sign in using Chrome or Edge.
2. Create a new meeting.
3. Copy the complete meeting invitation URL.
4. Open an Incognito/InPrivate browser window.
5. Sign in with another NexaRoom user account.
6. Paste the meeting link and join.
7. Allow camera and microphone permissions.
8. Test video, audio, chat, screen sharing, reactions, whiteboard, and encrypted file sharing.

When sharing an encrypted invite link, keep the complete URL including the `#k=...` section.

---

## Security Notes

NexaRoom includes:

- Django authentication and sessions
- CSRF protection
- HTTP-only session cookies
- WebRTC encrypted media transport
- AES-GCM encrypted file sharing
- Meeting IDs and passcodes
- Host-level meeting permissions
- Environment-based configuration for credentials

For a production deployment, use HTTPS and secure production credentials.

---

## V7 Interface

NexaRoom V7 introduces a complete frontend refresh while keeping V6 functionality unchanged.

### V7 improvements

- Midnight navy + blue/cyan visual system
- Redesigned dashboard
- Redesigned meeting-management screens
- Redesigned authentication pages
- Redesigned plans and checkout
- Updated meeting-room styling
- Updated Control Center styling
- Shorter and more professional interface copy
- Updated NexaRoom branding

---

## CodeAlpha Task 4 Coverage

| Requirement | Implementation |
| --- | --- |
| Multi-user video calling | WebRTC |
| Screen sharing | `getDisplayMedia()` |
| File sharing | Real-time encrypted file relay |
| Collaborative whiteboard | HTML Canvas + Socket.IO |
| Data encryption | WebRTC + AES-GCM |
| User authentication | Django Authentication |
| Real-time communication | Python Socket.IO |
| Backend & data handling | Django + MySQL |

---

## Project Links

- **GitHub Repository:** https://github.com/Gopivemuri-tech/CodeAlpha_RealTimeCommunicationApp
- **LinkedIn Project Post:** https://www.linkedin.com/feed/update/urn:li:ugcPost:7510707367219630080/

## Production Roadmap

The current project uses a WebRTC mesh architecture, which is suitable for demonstrations and smaller meeting rooms.

For a large-scale production deployment, future improvements can include:

- HTTPS deployment
- TURN server
- SFU architecture using LiveKit, mediasoup, Janus, or Jitsi
- Redis
- Object storage
- Production payment gateway integration
- Monitoring and logging
- Automated backups
- Load testing
- Mobile application support

---

## CodeAlpha Internship

This project was created as part of the **CodeAlpha Full Stack Development Internship** to demonstrate practical experience in full-stack development, real-time communication, backend development, database integration, and collaborative web technologies.

---

## Author

**Gopi Vemuri**

B.Tech — Computer Science & Engineering (Data Science)

---

### NexaRoom

**Connect. Collaborate. Communicate.**
