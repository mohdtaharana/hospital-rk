# Radhe Krishna Hospital - Management System

## Project Overview
- **Name**: Radhe Krishna Multi-Specialty Hospital
- **Goal**: Complete hospital management system with responsive website and admin/patient dashboards
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + D1 Database + TailwindCSS

## Live URLs
- **Website**: `/` - Main hospital website
- **Admin Dashboard**: `/admin/login` - Hospital management system
- **Patient Portal**: `/patient/login` - Patient appointment tracking

## Login Credentials
### Admin
- **Username**: `Taharana`
- **Password**: `Taharana@123`

### Sample Patient
- **Username**: `patient1`
- **Password**: `patient123`

## Features

### Website (Frontend)
- Responsive design (mobile-optimized)
- Hero section with video background
- About Us / Vision & Mission
- Our Values section
- Philosophy carousel with GSAP animations
- Services carousel (Surgery, Orthopedics, ENT, Pediatrics, Medicine)
- Stay section (Inpatient/Outpatient/Visitors)
- Appointment booking form with EmailJS integration
- Footer with social links

### Admin Dashboard
- **Overview**: Stats cards (patients, appointments, doctors, revenue) + Charts
- **Appointments**: View all, filter by status, confirm/complete/delete
- **Patients**: Add, search, view, delete patients
- **Doctors**: Add, view, delete doctors (8 departments)
- **Payments**: Record and view payment history
- **Graphs**: Line chart (appointments), Doughnut (departments), Bar (revenue)

### Patient Dashboard
- View personal appointments
- Track appointment status
- See upcoming appointments

## API Endpoints

### Public
- `POST /api/public/book-appointment` - Book appointment from website

### Auth
- `POST /api/auth/login` - Login (returns token)

### Protected (requires Bearer token)
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/graph/appointments` - Appointment chart data
- `GET /api/dashboard/graph/revenue` - Revenue chart data
- `GET /api/dashboard/graph/departments` - Department distribution

- `GET /api/patients` - List patients (search, pagination)
- `POST /api/patients` - Add patient
- `PUT /api/patients/:id` - Update patient
- `DELETE /api/patients/:id` - Delete patient

- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment

- `GET /api/doctors` - List all doctors
- `POST /api/doctors` - Add doctor
- `DELETE /api/doctors/:id` - Delete doctor

- `GET /api/payments` - List payments
- `POST /api/payments` - Record payment

## Data Architecture
- **Database**: Cloudflare D1 (SQLite)
- **Tables**: users, patients, doctors, appointments, payments
- **Storage**: Local SQLite for development, Cloudflare D1 for production

## Development

```bash
# Install dependencies
npm install

# Apply database migrations
npm run db:migrate:local

# Seed sample data
npm run db:seed

# Build
npm run build

# Start development server
npm run dev:sandbox
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Ready for deployment
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## Mobile Responsiveness Fixes
- Fixed horizontal overflow on all sections
- Fixed text clipping in About Us section
- Fixed button positioning on mobile
- Added proper word-wrap and overflow-wrap
- Fixed footer layout on mobile
- Made all sections contain within viewport width
- Added `playsinline` for mobile video autoplay
- Optimized image sizes with width parameters
- Added `loading="lazy"` for all off-screen images
