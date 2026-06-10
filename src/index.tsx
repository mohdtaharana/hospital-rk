import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
}

type Variables = {
  user?: { id: number; username: string; role: string; name: string }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/api/*', cors())

// ============ AUTH API ============
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  const db = c.env.DB

  const user = await db.prepare(
    'SELECT * FROM users WHERE username = ? AND password = ?'
  ).bind(username, password).first()

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  // Simple token (in production use JWT)
  const token = btoa(`${user.id}:${user.username}:${user.role}:${Date.now()}`)

  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      email: user.email
    }
  })
})

// Auth middleware
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.replace('Bearer ', '')
  try {
    const decoded = atob(token)
    const [id, username, role] = decoded.split(':')
    c.set('user', { id: parseInt(id), username, role, name: username })
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

// ============ DASHBOARD STATS ============
app.get('/api/dashboard/stats', authMiddleware, async (c) => {
  const db = c.env.DB
  const user = c.get('user')

  if (user?.role === 'admin') {
    const totalPatients = await db.prepare('SELECT COUNT(*) as count FROM patients').first()
    const totalAppointments = await db.prepare('SELECT COUNT(*) as count FROM appointments').first()
    const todayAppointments = await db.prepare(
      "SELECT COUNT(*) as count FROM appointments WHERE date = date('now')"
    ).first()
    const pendingAppointments = await db.prepare(
      "SELECT COUNT(*) as count FROM appointments WHERE status = 'pending'"
    ).first()
    const totalDoctors = await db.prepare('SELECT COUNT(*) as count FROM doctors').first()
    const revenue = await db.prepare('SELECT SUM(amount) as total FROM payments').first()

    return c.json({
      totalPatients: totalPatients?.count || 0,
      totalAppointments: totalAppointments?.count || 0,
      todayAppointments: todayAppointments?.count || 0,
      pendingAppointments: pendingAppointments?.count || 0,
      totalDoctors: totalDoctors?.count || 0,
      revenue: revenue?.total || 0
    })
  } else {
    // Patient dashboard
    const patientId = user?.id
    const myAppointments = await db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE patient_id = ?'
    ).bind(patientId).first()
    const upcomingAppointments = await db.prepare(
      "SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND date >= date('now') AND status = 'confirmed'"
    ).bind(patientId).first()

    return c.json({
      myAppointments: myAppointments?.count || 0,
      upcomingAppointments: upcomingAppointments?.count || 0
    })
  }
})

// ============ GRAPH DATA ============
app.get('/api/dashboard/graph/appointments', authMiddleware, async (c) => {
  const db = c.env.DB
  const results = await db.prepare(`
    SELECT date, COUNT(*) as count 
    FROM appointments 
    WHERE date >= date('now', '-30 days')
    GROUP BY date 
    ORDER BY date ASC
  `).all()

  return c.json(results.results || [])
})

app.get('/api/dashboard/graph/revenue', authMiddleware, async (c) => {
  const db = c.env.DB
  const results = await db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as total 
    FROM payments 
    GROUP BY month 
    ORDER BY month ASC 
    LIMIT 12
  `).all()

  return c.json(results.results || [])
})

app.get('/api/dashboard/graph/departments', authMiddleware, async (c) => {
  const db = c.env.DB
  const results = await db.prepare(`
    SELECT department, COUNT(*) as count 
    FROM appointments 
    GROUP BY department
  `).all()

  return c.json(results.results || [])
})

// ============ PATIENTS API ============
app.get('/api/patients', authMiddleware, async (c) => {
  const db = c.env.DB
  const { page = '1', limit = '10', search = '' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query = 'SELECT * FROM patients'
  let countQuery = 'SELECT COUNT(*) as count FROM patients'
  const params: any[] = []

  if (search) {
    query += ' WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?'
    countQuery += ' WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'

  const total = await db.prepare(countQuery).bind(...params).first()
  const patients = await db.prepare(query).bind(...params, parseInt(limit), offset).all()

  return c.json({
    patients: patients.results,
    total: total?.count || 0,
    page: parseInt(page),
    limit: parseInt(limit)
  })
})

app.post('/api/patients', authMiddleware, async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { name, email, phone, age, gender, address, blood_group } = body

  const result = await db.prepare(
    'INSERT INTO patients (name, email, phone, age, gender, address, blood_group) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(name, email || '', phone, age || 0, gender || '', address || '', blood_group || '').run()

  return c.json({ id: result.meta.last_row_id, message: 'Patient added successfully' }, 201)
})

app.put('/api/patients/:id', authMiddleware, async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, email, phone, age, gender, address, blood_group } = body

  await db.prepare(
    'UPDATE patients SET name=?, email=?, phone=?, age=?, gender=?, address=?, blood_group=? WHERE id=?'
  ).bind(name, email || '', phone, age || 0, gender || '', address || '', blood_group || '', id).run()

  return c.json({ message: 'Patient updated successfully' })
})

app.delete('/api/patients/:id', authMiddleware, async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.prepare('DELETE FROM patients WHERE id=?').bind(id).run()
  return c.json({ message: 'Patient deleted successfully' })
})

// ============ APPOINTMENTS API ============
app.get('/api/appointments', authMiddleware, async (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const { page = '1', limit = '10', status = '' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query = `SELECT a.*, p.name as patient_name, d.name as doctor_name 
               FROM appointments a 
               LEFT JOIN patients p ON a.patient_id = p.id 
               LEFT JOIN doctors d ON a.doctor_id = d.id`
  let countQuery = 'SELECT COUNT(*) as count FROM appointments a'
  const params: any[] = []

  if (user?.role === 'patient') {
    query += ' WHERE a.patient_id = ?'
    countQuery += ' WHERE a.patient_id = ?'
    params.push(user.id)
  } else if (status) {
    query += ' WHERE a.status = ?'
    countQuery += ' WHERE a.status = ?'
    params.push(status)
  }

  query += ' ORDER BY a.date DESC, a.time DESC LIMIT ? OFFSET ?'

  const total = await db.prepare(countQuery).bind(...params).first()
  const appointments = await db.prepare(query).bind(...params, parseInt(limit), offset).all()

  return c.json({
    appointments: appointments.results,
    total: total?.count || 0,
    page: parseInt(page),
    limit: parseInt(limit)
  })
})

app.post('/api/appointments', authMiddleware, async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { patient_id, doctor_id, department, date, time, message, status } = body

  const result = await db.prepare(
    'INSERT INTO appointments (patient_id, doctor_id, department, date, time, message, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(patient_id, doctor_id || null, department, date, time || '09:00', message || '', status || 'pending').run()

  return c.json({ id: result.meta.last_row_id, message: 'Appointment booked successfully' }, 201)
})

app.put('/api/appointments/:id', authMiddleware, async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  const { status, date, time, department, doctor_id } = body

  await db.prepare(
    'UPDATE appointments SET status=?, date=?, time=?, department=?, doctor_id=? WHERE id=?'
  ).bind(status, date, time, department, doctor_id || null, id).run()

  return c.json({ message: 'Appointment updated successfully' })
})

app.delete('/api/appointments/:id', authMiddleware, async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.prepare('DELETE FROM appointments WHERE id=?').bind(id).run()
  return c.json({ message: 'Appointment deleted successfully' })
})

// ============ DOCTORS API ============
app.get('/api/doctors', authMiddleware, async (c) => {
  const db = c.env.DB
  const doctors = await db.prepare('SELECT * FROM doctors ORDER BY name ASC').all()
  return c.json(doctors.results || [])
})

app.post('/api/doctors', authMiddleware, async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { name, department, specialization, phone, email, experience } = body

  const result = await db.prepare(
    'INSERT INTO doctors (name, department, specialization, phone, email, experience) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(name, department, specialization || '', phone || '', email || '', experience || 0).run()

  return c.json({ id: result.meta.last_row_id, message: 'Doctor added successfully' }, 201)
})

app.delete('/api/doctors/:id', authMiddleware, async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.prepare('DELETE FROM doctors WHERE id=?').bind(id).run()
  return c.json({ message: 'Doctor deleted successfully' })
})

// ============ PAYMENTS API ============
app.get('/api/payments', authMiddleware, async (c) => {
  const db = c.env.DB
  const { page = '1', limit = '10' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const payments = await db.prepare(`
    SELECT pay.*, p.name as patient_name 
    FROM payments pay 
    LEFT JOIN patients p ON pay.patient_id = p.id 
    ORDER BY pay.payment_date DESC LIMIT ? OFFSET ?
  `).bind(parseInt(limit), offset).all()

  const total = await db.prepare('SELECT COUNT(*) as count FROM payments').first()

  return c.json({
    payments: payments.results,
    total: total?.count || 0,
    page: parseInt(page),
    limit: parseInt(limit)
  })
})

app.post('/api/payments', authMiddleware, async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { patient_id, amount, description, payment_date, status } = body

  const result = await db.prepare(
    'INSERT INTO payments (patient_id, amount, description, payment_date, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(patient_id, amount, description || '', payment_date || new Date().toISOString().split('T')[0], status || 'completed').run()

  return c.json({ id: result.meta.last_row_id, message: 'Payment recorded successfully' }, 201)
})

// ============ PUBLIC APPOINTMENT BOOKING ============
app.post('/api/public/book-appointment', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { name, phone, email, department, date, message } = body

  // Check if patient exists by phone
  let patient = await db.prepare('SELECT id FROM patients WHERE phone = ?').bind(phone).first()

  if (!patient) {
    // Create new patient
    const result = await db.prepare(
      'INSERT INTO patients (name, email, phone) VALUES (?, ?, ?)'
    ).bind(name, email || '', phone).run()
    patient = { id: result.meta.last_row_id }
  }

  // Create appointment
  await db.prepare(
    'INSERT INTO appointments (patient_id, department, date, message, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(patient.id, department, date, message || '', 'pending').run()

  return c.json({ message: 'Appointment booked successfully!' }, 201)
})

// ============ SERVE FRONTEND PAGES ============

// Admin Dashboard
app.get('/admin', (c) => c.redirect('/admin/login'))
app.get('/admin/login', (c) => {
  return c.html(getAdminLoginPage())
})
app.get('/admin/dashboard', (c) => {
  return c.html(getAdminDashboardPage())
})

// Patient Dashboard
app.get('/patient', (c) => c.redirect('/patient/login'))
app.get('/patient/login', (c) => {
  return c.html(getPatientLoginPage())
})
app.get('/patient/dashboard', (c) => {
  return c.html(getPatientDashboardPage())
})

// Main website pages
app.get('/', (c) => {
  return c.html(getMainPage())
})
app.get('/impatient', (c) => {
  return c.html(getInpatientPage())
})
app.get('/outpatient', (c) => {
  return c.html(getOutpatientPage())
})

export default app

// ============ PAGE TEMPLATES ============

function getMainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radhe-Krishna Hospital</title>
  <link rel="icon" type="image/png" href="/images/logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="/static/rk.css">
  <link rel="stylesheet" href="/static/responsive-fix.css">
  <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
  <script type="text/javascript">
   (function(){
      emailjs.init({
        publicKey: "Rd0JBPTGx_SSrSsAM",
      });
   })();
  </script>
</head>
<body>
  <div class="main">
  <section class="hero" id="hero">
    <div class="content">
      <video autoplay muted loop playsinline class="hero-image" src="/images/hero-video.mp4"></video>
      <div class="leftcon">
        <h1>healing with heart,<br>leading with excellence</h1>
        <p>A multi-speciality healthcare solution with compassionate care and advanced expertise</p>
        <div class="hero-btns">
          <a href="#book-apt"><button class="btn-apt">book an appointment</button></a>
          <a href="#services-section"><button class="btn-exp">explore services</button></a>
        </div>
        <div class="con-down">
          <div class="images">
            <img src="https://img.freepik.com/free-photo/medium-shot-doctor-wearing-lab-coat_23-2148816191.jpg?w=200" alt="Doctor" loading="lazy">
            <img src="https://img.freepik.com/premium-photo/smiling-female-doctor-standing-crossing-hands-one-volor-background_953680-45073.jpg?w=200" alt="Doctor" loading="lazy">
            <img src="https://img.freepik.com/premium-photo/indian-female-doctor_714173-1860.jpg?w=200" alt="Doctor" loading="lazy">
            <img src="https://img.freepik.com/free-photo/young-bearded-male-doctor-wearing-white-coat-with-stethoscope-looking-camera-confused_141793-28210.jpg?w=200" alt="Doctor" loading="lazy">
          </div>
          <p>30+ certified <br> specialist</p>
        </div>
      </div>
      <div class="rightcon"></div>
    </div>
    <nav class="navbar">
      <div class="logo"><img src="/images/logo.png" alt="Radhe Krishna Logo"></div>
      <div class="hamburger">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </nav>
    <div class="fullscreen-nav">
      <ul>
        <li><a href="#preabout">About Us</a></li>
        <li><a href="#about">Philosophy</a></li>
        <li><a href="#services-section">Services</a></li>
        <li><a href="#stay">Stay</a></li>
        <li><a href="#book-apt">Contact Us</a></li>
        <li><a href="/admin/login">Admin Panel</a></li>
      </ul>
      <div class="buttons">
        <a href="#book-apt"><button class="book">Book an Appointment</button></a>
        <a href="#services-section"><button class="explore">Explore Services</button></a>
      </div>
    </div>
  </section>

  <div class="preabout" id="preabout">
    <div class="preabout-intro-hd">
      <div class="abt-hd"><p>about us</p></div>
      <hr class="r1"><hr class="r2">
    </div>
    <div class="item1">
      <div class="preabout2-hd">
        <img src="/images/rocket.png" alt="Vision">
        <h1>our vision and mission</h1>
        <div class="vertical-line2"></div>
        <ul>
          <li>Pioneering a healthcare experience that merges advanced medical expertise with compassionate patient care.</li>
          <li>Creating an environment where healing is supported by both science and understanding.</li>
          <li>Elevating healthcare through personalized attention and medical excellence.</li>
          <li>Combining innovative treatments with clear communication and preventive education.</li>
          <li>Guiding the community toward better health while building trust with every patient interaction.</li>
        </ul>
      </div>
    </div>
    <div class="item2">
      <div class="preabout2-hd">
        <img src="/images/about us.png" alt="About">
        <h1>about us</h1>
        <div class="vertical-line2"></div>
        <p>Radhe Krishna is a multi-specialty healthcare center setting new standards in patient care. Our facility brings together medical professionals across eight specialties: Nephrology, Neurology, Pediatrics, ENT, General Surgery, Orthopedics, Internal Medicine, and Gastroenterology.</p>
      </div>
    </div>
    <div class="item3">
      <div class="preabout2-hd">
        <img src="/images/comments.png" alt="Testimonials">
        <h1>what our patient say</h1>
        <div class="vertical-line2"></div>
        <div class="testimonial">
          <div class="testimonial-left">
            <div class="rating">4.9</div>
            <img class="dp" src="/images/dr4.avif" alt="Patient" loading="lazy">
          </div>
          <div class="testimonial-right">
            <h3>Mr. Shane, Parent of Pediatric Patient</h3>
            <p class="opinion">"As a father, I was worried about my child's surgery. The pediatric team's constant support and expertise made all the difference."</p>
          </div>
        </div>
      </div>
    </div>
    <div class="item4">
      <img src="https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcSWVmcIPZTpCKU9_6f_uGCbPYOLUb15OBGiOC1CTzwjt1a8X5g2" alt="Hospital" loading="lazy">
    </div>
    <div class="item5">
      <div class="preabout2-hd">
        <img src="/images/trophy.png" alt="Milestones">
        <h1>our milestones</h1>
        <div class="vertical-line2"></div>
        <p>Recognition has followed our efforts. We're proud to be on the path toward national medical board certifications, a testament to our commitment to maintaining the highest standards of medical care and patient safety.</p>
      </div>
    </div>
  </div>

  <div class="preabout2">
    <div class="preabout2-hd">
      <i class="fa-regular fa-star"></i>
      <h1 class="hdd">our values</h1>
      <div class="vertical-line"></div>
    </div>
    <div class="items1">
      <div class="items1-left"><img src="https://img.freepik.com/premium-photo/nurse-white-robe-with-stethoscope-her-neck-is-making-report-table_567313-3985.jpg?w=600" alt="Empathy" loading="lazy"></div>
      <div class="items1-rightt">
        <h1>Empathy in Action</h1>
        <p>We go beyond understanding - we truly connect with the needs of our patients. Our approach is built on compassion and respect, ensuring every individual feels valued and cared for.</p>
      </div>
    </div>
    <div class="items2">
      <div class="items2-left"><img src="https://img.freepik.com/premium-photo/front-view-young-intellectual-healthcare-doctor-labcoat-with-blond-hair-standing_567313-4671.jpg?w=600" alt="Excellence" loading="lazy"></div>
      <div class="items2-rightt">
        <h1>Pursuit of Excellence</h1>
        <p>We are driven by an unwavering commitment to achieving the highest standards in healthcare. By embracing innovation and continuous learning, we strive to set new benchmarks in medical expertise.</p>
      </div>
    </div>
    <div class="items3">
      <div class="items3-left"><img src="https://img.freepik.com/premium-photo/portrait-smiling-male-doctor-holding-clipboard_255757-1512.jpg?w=600" alt="Precision" loading="lazy"></div>
      <div class="items3-rightt">
        <h1>Precision and Responsiveness</h1>
        <p>Time and accuracy are at the core of what we do. Our focus on efficiency ensures that every patient receives timely, tailored, and effective treatment.</p>
      </div>
    </div>
    <div class="items4">
      <div class="items4-left"><img src="https://img.freepik.com/premium-photo/handsome-doctor-portrait-background_488220-12659.jpg?w=600" alt="Reliability" loading="lazy"></div>
      <div class="items4-rightt">
        <h1>Reliability You Can Trust</h1>
        <p>Consistency defines us. From your first consultation to post-treatment care, we uphold the highest standards at every step.</p>
      </div>
    </div>
  </div>

  <div class="about" id="about">
    <div class="circle-abt">
      <div class="images-abt">
        <img src="https://img.freepik.com/premium-photo/portrait-smiling-young-man-against-white-background_1048944-23214614.jpg?w=300" alt="Doctor" loading="lazy">
        <img src="https://img.freepik.com/premium-photo/male-student-doctor-does-pcr-test-patient-takes-it-analysis_283470-2528.jpg?w=300" alt="Doctor" loading="lazy">
        <img src="https://img.freepik.com/premium-photo/female-medical-worker-doctor-woman-glasses-looking-camera-shows-thumbs-up-hospital-clinic_717737-449.jpg?w=300" alt="Doctor" loading="lazy">
        <img src="https://img.freepik.com/premium-photo/nurse-taking-nasal-swab-from-senior-patient-test-possible-coronavirus-infection_274689-32295.jpg?w=300" alt="Doctor" loading="lazy">
      </div>
    </div>
    <h1 class="about-hd">philosophy</h1>
    <div class="container">
      <div class="wrapper">
        <div class="item 1 active"><img src="/images/hero-dr.jpg" alt="Doctor"></div>
        <div class="item 2"><img src="https://img.freepik.com/free-photo/medium-shot-doctor-wearing-lab-coat_23-2148816191.jpg?w=400" alt="Doctor" loading="lazy"></div>
        <div class="item 3"><img src="https://img.freepik.com/premium-photo/smiling-female-doctor-standing-crossing-hands-one-volor-background_953680-45073.jpg?w=400" alt="Doctor" loading="lazy"></div>
        <div class="item 4" id="item4"><img src="https://img.freepik.com/premium-photo/smiling-female-doctor-holding-medical-records-one-color-background-copy-space_953680-43415.jpg?w=400" alt="Doctor" loading="lazy"></div>
        <svg viewBox="0 0 300 300"><circle id="holder" class="st0" cx="151" cy="151" r="150"/></svg>
      </div>
    </div>
    <div class="abt-btns">
      <button id="prev"><i class="fas fa-chevron-up"></i></button>
      <button id="next"><i class="fas fa-chevron-down"></i></button>
    </div>
    <div class="right-content">
      <button class="btn1">ABOUT US</button>
      <h1>Expert Team</h1>
      <p>Our team consists of highly trained professionals dedicated to providing the best care for our patients with state-of-the-art technology.</p>
      <a href="#book-apt"><button class="btn2">Book an appointment</button></a>
    </div>
    <a href="#services-section"><button class="scroll-down scroll-down2"><span>&#8595;</span></button></a>
  </div>

  <div class="services-section" id="services-section">
    <p class="ser_text">Experience comprehensive healthcare through our special departments</p>
    <p class="active_service">Surgery</p>
    <div class="btns">
      <a href="#book-apt"><button class="book-apt">book an appointment</button></a>
      <button class="learn" id="learnMore">learn more <i class="fas fa-arrow-right"></i></button>
    </div>
    <h1>Services</h1>
    <div class="carousel">
      <button class="carousel-btn prev-btn"><i class="fas fa-arrow-left"></i></button>
      <button class="carousel-btn next-btn"><i class="fas fa-arrow-right"></i></button>
      <div class="carousel-track-container">
        <div class="carousel-track">
          <div class="carousel-item" id="caro-item1" data-service="surgery"><img src="https://img.freepik.com/free-photo/surgeons-passing-scissors-each-other_329181-19635.jpg?w=600" alt="Surgery" loading="lazy"></div>
          <div class="carousel-item carousel-item-2" data-service="orthopedic"><img src="https://img.freepik.com/premium-photo/physiotherapist-holding-skeleton-feet-model_107420-53154.jpg?w=600" alt="Orthopedic" loading="lazy"></div>
          <div class="carousel-item carousel-item-2" data-service="ENT"><img src="https://img.freepik.com/free-photo/doctor-using-inspection-spatula-examine-patient-throat-ent-doctor-doing-throat-exam-woman-patient-opened-her-mouth-throat-checkup_657921-246.jpg?w=600" alt="ENT" loading="lazy"></div>
          <div class="carousel-item carousel-item-2" data-service="Pediatric"><img src="https://img.freepik.com/free-photo/african-american-pediatrician-doctor-analyzing-sickness-expertise-using-tablet_482257-26937.jpg?w=600" alt="Pediatric" loading="lazy"></div>
          <div class="carousel-item carousel-item-2" data-service="Medicine"><img src="https://img.freepik.com/free-photo/flat-lay-arrangement-with-pills_23-2148504582.jpg?w=600" alt="Medicine" loading="lazy"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="post_services hidden">
    <button id="back"><i class="fas fa-arrow-left"></i></button>
    <a href="#book-apt"><button id="bkapt">book an appointment</button></a>
    <p class="active_service2">Surgery</p>
    <div class="ser ser1"><h1>conditions treated</h1><ul></ul></div>
    <div class="ser ser2"><h1>diagnostic procedure</h1><ul></ul></div>
    <div class="ser ser3"><h1>treatment options</h1><ul></ul></div>
  </div>

  <div class="stay" id="stay">
    <p class="hd_stay">stay</p>
    <h1 class="bg_stay">stay</h1>
    <p class="p_stay">we aim to make your stay as <span>comfortable</span> and restorative as possible. Our <span>dedicated</span> team is committed to not only providing <span>expert</span> medical care but also ensuring that you feel <span>genuinely</span> cared for and supported during your time with us. Your well being is our priority</p>
  </div>

  <div class="your">
    <div class="your_top">
      <p class="yh1 yh11" id="mytext">your care, your comfort</p>
      <p class="yh1 yh12" id="mytext">your choice</p>
    </div>
    <div class="your_down">
      <div class="your_item yitem1">
        <h1>inpatient stay</h1>
        <p>We provide comprehensive 24-hour medical care for patients requiring overnight stays.</p>
        <button onclick="redirectToPage('impatient')">learn more</button>
      </div>
      <div class="your_item yitem2">
        <h1>outpatient stay</h1>
        <p>Access quality medical care through our same-day services.</p>
        <button onclick="redirectToPage('outpatient')">learn more</button>
      </div>
      <div class="your_item yitem3">
        <h1>visitors</h1>
        <p>We welcome family and friends as essential parts of our patients' healing journey.</p>
        <button onclick="redirectToPage('visitors')">learn more</button>
      </div>
    </div>
  </div>

  <div class="bookapt" id="book-apt">
    <section class="bookappointment">
      <h1>Book Appointment</h1>
      <form id="appointmentForm">
        <div class="form-container">
          <div class="form-left">
            <div class="form-group">
              <label for="name">Name</label>
              <i class="fas fa-user"></i>
              <input type="text" id="name" placeholder="Enter your name" required>
            </div>
            <div class="form-group">
              <label for="phone">Phone</label>
              <i class="fas fa-phone"></i>
              <input type="text" id="phone" placeholder="Enter your phone number" required>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <i class="fas fa-envelope"></i>
              <input type="email" id="email" placeholder="Enter your email (optional)">
            </div>
            <div class="form-group">
              <label for="department">Department</label>
              <i class="fas fa-hospital"></i>
              <select id="department" required>
                <option value="" disabled selected>Choose Department</option>
                <option value="Surgery">Surgery</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="ENT">ENT</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Medicine">Medicine</option>
              </select>
            </div>
          </div>
          <div class="form-divider"></div>
          <div class="form-right">
            <div class="form-group">
              <label for="date">Preferred Date</label>
              <i class="fas fa-calendar-alt"></i>
              <input type="date" id="date" required>
            </div>
            <div class="form-group">
              <label for="message">Message</label>
              <i class="fas fa-comment-dots"></i>
              <textarea id="message" placeholder="Enter your message"></textarea>
            </div>
            <div class="form-group">
              <button type="submit">Submit</button>
            </div>
          </div>
        </div>
      </form>
    </section>
  </div>

  <section class="footer">
    <div class="footer_top">
      <a href="#hero"><div class="logo"><img src="/images/logo.png" alt="Logo"></div></a>
      <a href="#hero"><button><i class="fa-solid fa-angle-up"></i></button></a>
    </div>
    <div class="footer_bottom">
      <div class="ftr_left">
        <div class="icons">
          <a href="https://www.facebook.com/share/19xJFmXJem/"><i class="fab fa-facebook"></i></a>
          <a href="https://www.instagram.com/radhekrishnamultihospital?igsh=MW1pZ25ld2dvc3JqZA=="><i class="fab fa-instagram"></i></a>
          <i class="fab fa-twitter"></i>
        </div>
        <hr>
        <div class="ftr_left_bottom">
          <div class="abt_left">
            <h1>About us</h1>
            <ul><li>Vision and mission</li><li>milestone</li><li>reviews</li></ul>
          </div>
          <div class="services_mid">
            <h1>services</h1>
            <ul><li>orthopedic</li><li>pediatric</li><li>Gastroenterology</li><li>neurology</li><li>Nephrology</li><li>surgery</li><li>ENT</li><li>Medicine</li></ul>
          </div>
          <div class="stay_left">
            <h1>Stay</h1>
            <ul><li>inpatient</li><li>outpatient</li><li>visitors</li></ul>
          </div>
        </div>
      </div>
      <div class="ftr_right_bottom">
        <div class="ftr_img1"><img src="https://img.freepik.com/premium-photo/smiling-female-doctor-standing-crossing-hands-one-volor-background_953680-45595.jpg?w=300" alt="Doctor" loading="lazy"></div>
        <div class="ftr_img2"><img src="https://img.freepik.com/premium-photo/smiling-female-doctor-standing-crossing-hands-one-volor-background_953680-45570.jpg?w=400" alt="Doctor" loading="lazy"></div>
        <div class="ftr_img3"><img src="https://img.freepik.com/free-photo/smiling-young-male-doctor-wearing-stethoscope-medical-gown-isolated-white-wall_141793-35979.jpg?w=400" alt="Doctor" loading="lazy"></div>
      </div>
    </div>
  </section>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/MotionPathPlugin.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/SplitText.min.js"></script>
  <script src="https://unpkg.com/split-type"></script>
  <script src="/static/script.js"></script>
</body>
</html>`
}

function getInpatientPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Inpatient - Radhe Krishna</title><link rel="stylesheet" href="/static/rk.css"><link rel="stylesheet" href="/static/responsive-fix.css"><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet"></head><body style="font-family:Montserrat,sans-serif;padding:40px 20px;max-width:900px;margin:auto;"><a href="/" style="text-decoration:none;color:#348061;font-size:18px;"><i class="fas fa-arrow-left"></i> Back to Home</a><h1 style="color:#2c684c;margin-top:20px;">Inpatient Services</h1><p style="color:#5d6776;line-height:1.8;font-size:16px;margin-top:20px;">We provide comprehensive 24-hour medical care for patients requiring overnight stays. Our inpatient facilities include private and semi-private rooms equipped with modern medical technology, round-the-clock nursing care, daily physician visits, and nutritious meal plans tailored to each patient's dietary needs.</p><h2 style="color:#2c684c;margin-top:30px;">What We Offer</h2><ul style="color:#5d6776;line-height:2;font-size:15px;padding-left:20px;"><li>24/7 nursing care and monitoring</li><li>Modern private and semi-private rooms</li><li>Advanced diagnostic equipment</li><li>Personalized treatment plans</li><li>Nutritional counseling and meal service</li><li>Physical therapy and rehabilitation</li><li>Family visiting hours</li></ul><a href="/#book-apt" style="display:inline-block;margin-top:30px;padding:12px 25px;background:#348061;color:white;text-decoration:none;border-radius:25px;font-size:16px;">Book an Appointment</a></body></html>`
}

function getOutpatientPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Outpatient - Radhe Krishna</title><link rel="stylesheet" href="/static/rk.css"><link rel="stylesheet" href="/static/responsive-fix.css"><link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet"></head><body style="font-family:Montserrat,sans-serif;padding:40px 20px;max-width:900px;margin:auto;"><a href="/" style="text-decoration:none;color:#348061;font-size:18px;"><i class="fas fa-arrow-left"></i> Back to Home</a><h1 style="color:#2c684c;margin-top:20px;">Outpatient Services</h1><p style="color:#5d6776;line-height:1.8;font-size:16px;margin-top:20px;">Access quality medical care through our same-day services. Our outpatient department provides consultations, diagnostic tests, minor procedures, and follow-up care without the need for overnight hospitalization.</p><h2 style="color:#2c684c;margin-top:30px;">Our Outpatient Services</h2><ul style="color:#5d6776;line-height:2;font-size:15px;padding-left:20px;"><li>Specialist consultations</li><li>Diagnostic imaging and lab tests</li><li>Minor surgical procedures</li><li>Preventive health check-ups</li><li>Follow-up appointments</li><li>Vaccination services</li><li>Same-day results for most tests</li></ul><a href="/#book-apt" style="display:inline-block;margin-top:30px;padding:12px 25px;background:#348061;color:white;text-decoration:none;border-radius:25px;font-size:16px;">Book an Appointment</a></body></html>`
}

function getAdminLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login - Radhe Krishna Hospital</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Montserrat',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#085737 0%,#2c684c 50%,#348061 100%); padding:20px; }
    .login-card { background:white; border-radius:20px; padding:40px; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
    .login-card h1 { text-align:center; color:#2c684c; font-size:24px; margin-bottom:8px; }
    .login-card p { text-align:center; color:#6c7787; font-size:14px; margin-bottom:30px; }
    .form-group { margin-bottom:20px; }
    .form-group label { display:block; font-size:13px; color:#5d6776; margin-bottom:6px; font-weight:500; }
    .form-group input { width:100%; padding:12px 15px; border:2px solid #e3ecff; border-radius:10px; font-size:15px; outline:none; transition:border-color 0.3s; }
    .form-group input:focus { border-color:#348061; }
    .login-btn { width:100%; padding:14px; background:#2c684c; color:white; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:background 0.3s; }
    .login-btn:hover { background:#085737; }
    .error { color:#e74c3c; text-align:center; font-size:13px; margin-top:10px; display:none; }
    .back-link { display:block; text-align:center; margin-top:20px; color:#6c7787; text-decoration:none; font-size:13px; }
    .back-link:hover { color:#2c684c; }
    .logo { text-align:center; margin-bottom:20px; }
    .logo img { height:60px; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo"><img src="/images/logo.png" alt="Logo"></div>
    <h1>Admin Login</h1>
    <p>Sign in to access the management dashboard</p>
    <form id="loginForm">
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="username" placeholder="Enter username" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="Enter password" required>
      </div>
      <button type="submit" class="login-btn"><i class="fas fa-sign-in-alt"></i> Login</button>
      <p class="error" id="error">Invalid credentials. Please try again.</p>
    </form>
    <a href="/" class="back-link"><i class="fas fa-arrow-left"></i> Back to Website</a>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async(e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/auth/login', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({username, password})
        });
        const data = await res.json();
        if(res.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.location.href = '/admin/dashboard';
        } else {
          document.getElementById('error').style.display='block';
        }
      } catch(err) {
        document.getElementById('error').style.display='block';
      }
    });
  </script>
</body>
</html>`
}

function getPatientLoginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patient Login - Radhe Krishna Hospital</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Montserrat',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#626a7c 0%,#6c7e85 50%,#70828b 100%); padding:20px; }
    .login-card { background:white; border-radius:20px; padding:40px; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
    .login-card h1 { text-align:center; color:#2c684c; font-size:24px; margin-bottom:8px; }
    .login-card p { text-align:center; color:#6c7787; font-size:14px; margin-bottom:30px; }
    .form-group { margin-bottom:20px; }
    .form-group label { display:block; font-size:13px; color:#5d6776; margin-bottom:6px; font-weight:500; }
    .form-group input { width:100%; padding:12px 15px; border:2px solid #e3ecff; border-radius:10px; font-size:15px; outline:none; transition:border-color 0.3s; }
    .form-group input:focus { border-color:#348061; }
    .login-btn { width:100%; padding:14px; background:#626a7c; color:white; border:none; border-radius:10px; font-size:16px; font-weight:600; cursor:pointer; transition:background 0.3s; }
    .login-btn:hover { background:#4a5162; }
    .error { color:#e74c3c; text-align:center; font-size:13px; margin-top:10px; display:none; }
    .back-link { display:block; text-align:center; margin-top:20px; color:#6c7787; text-decoration:none; font-size:13px; }
    .logo { text-align:center; margin-bottom:20px; }
    .logo img { height:60px; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo"><img src="/images/logo.png" alt="Logo"></div>
    <h1>Patient Portal</h1>
    <p>Sign in to view your appointments and records</p>
    <form id="loginForm">
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="username" placeholder="Enter username" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="Enter password" required>
      </div>
      <button type="submit" class="login-btn"><i class="fas fa-sign-in-alt"></i> Login</button>
      <p class="error" id="error">Invalid credentials. Please try again.</p>
    </form>
    <a href="/" class="back-link"><i class="fas fa-arrow-left"></i> Back to Website</a>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async(e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/auth/login', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({username, password})
        });
        const data = await res.json();
        if(res.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.location.href = '/patient/dashboard';
        } else {
          document.getElementById('error').style.display='block';
        }
      } catch(err) {
        document.getElementById('error').style.display='block';
      }
    });
  </script>
</body>
</html>`
}

function getAdminDashboardPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - Radhe Krishna Hospital</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Montserrat',sans-serif; background:#f4f6f8; min-height:100vh; }
    .sidebar { position:fixed; left:0; top:0; width:260px; height:100vh; background:#085737; color:white; padding:20px; overflow-y:auto; z-index:1000; transition:transform 0.3s; }
    .sidebar .logo { text-align:center; margin-bottom:30px; padding:10px; }
    .sidebar .logo img { height:50px; }
    .sidebar .logo h2 { font-size:14px; margin-top:8px; color:#6fbfa2; }
    .sidebar nav a { display:flex; align-items:center; gap:12px; padding:12px 15px; color:#b5bbc4; text-decoration:none; border-radius:10px; margin-bottom:5px; font-size:14px; transition:all 0.3s; }
    .sidebar nav a:hover, .sidebar nav a.active { background:#2c684c; color:white; }
    .sidebar nav a i { width:20px; text-align:center; }
    .main-content { margin-left:260px; padding:30px; min-height:100vh; }
    .top-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; flex-wrap:wrap; gap:15px; }
    .top-bar h1 { font-size:24px; color:#2c684c; }
    .top-bar .user-info { display:flex; align-items:center; gap:10px; }
    .top-bar .user-info span { color:#5d6776; font-size:14px; }
    .top-bar .logout-btn { padding:8px 16px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; }
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; margin-bottom:30px; }
    .stat-card { background:white; border-radius:15px; padding:25px; box-shadow:0 2px 10px rgba(0,0,0,0.05); }
    .stat-card .icon { width:45px; height:45px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; margin-bottom:15px; }
    .stat-card .icon.green { background:#e8f5e9; color:#2c684c; }
    .stat-card .icon.blue { background:#e3f2fd; color:#1565c0; }
    .stat-card .icon.orange { background:#fff3e0; color:#e65100; }
    .stat-card .icon.purple { background:#f3e5f5; color:#7b1fa2; }
    .stat-card h3 { font-size:28px; color:#2c684c; margin-bottom:5px; }
    .stat-card p { font-size:13px; color:#6c7787; }
    .charts-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(400px,1fr)); gap:20px; margin-bottom:30px; }
    .chart-card { background:white; border-radius:15px; padding:25px; box-shadow:0 2px 10px rgba(0,0,0,0.05); }
    .chart-card h3 { color:#2c684c; font-size:16px; margin-bottom:15px; }
    .section-card { background:white; border-radius:15px; padding:25px; box-shadow:0 2px 10px rgba(0,0,0,0.05); margin-bottom:20px; }
    .section-card h3 { color:#2c684c; font-size:18px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; }
    .section-card .add-btn { padding:8px 16px; background:#2c684c; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; }
    table { width:100%; border-collapse:collapse; }
    table th { text-align:left; padding:12px; font-size:12px; color:#6c7787; text-transform:uppercase; border-bottom:2px solid #f4f6f8; }
    table td { padding:12px; font-size:13px; color:#333; border-bottom:1px solid #f4f6f8; }
    table tr:hover { background:#f8fffe; }
    .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
    .badge.pending { background:#fff3e0; color:#e65100; }
    .badge.confirmed { background:#e8f5e9; color:#2e7d32; }
    .badge.completed { background:#e3f2fd; color:#1565c0; }
    .badge.cancelled { background:#ffebee; color:#c62828; }
    .action-btn { padding:5px 10px; border:none; border-radius:5px; cursor:pointer; font-size:11px; margin-right:5px; }
    .action-btn.edit { background:#e3f2fd; color:#1565c0; }
    .action-btn.delete { background:#ffebee; color:#c62828; }
    .action-btn.confirm { background:#e8f5e9; color:#2e7d32; }
    .tab-nav { display:flex; gap:5px; margin-bottom:20px; flex-wrap:wrap; }
    .tab-nav button { padding:10px 20px; border:none; background:#e3ecff; color:#5d6776; border-radius:8px; cursor:pointer; font-size:13px; font-weight:500; }
    .tab-nav button.active { background:#2c684c; color:white; }
    .tab-content { display:none; }
    .tab-content.active { display:block; }
    .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2000; align-items:center; justify-content:center; }
    .modal.active { display:flex; }
    .modal-content { background:white; border-radius:15px; padding:30px; width:90%; max-width:500px; max-height:90vh; overflow-y:auto; }
    .modal-content h3 { color:#2c684c; margin-bottom:20px; }
    .modal-content .form-group { margin-bottom:15px; }
    .modal-content .form-group label { display:block; font-size:13px; color:#5d6776; margin-bottom:5px; }
    .modal-content .form-group input, .modal-content .form-group select, .modal-content .form-group textarea { width:100%; padding:10px; border:2px solid #e3ecff; border-radius:8px; font-size:14px; outline:none; }
    .modal-content .form-group input:focus, .modal-content .form-group select:focus { border-color:#2c684c; }
    .modal-content .btn-row { display:flex; gap:10px; margin-top:20px; }
    .modal-content .btn-row button { flex:1; padding:12px; border:none; border-radius:8px; font-size:14px; cursor:pointer; font-weight:600; }
    .modal-content .btn-row .save-btn { background:#2c684c; color:white; }
    .modal-content .btn-row .cancel-btn { background:#f4f6f8; color:#5d6776; }
    .hamburger-dash { display:none; position:fixed; top:15px; left:15px; z-index:1100; background:#2c684c; color:white; border:none; width:40px; height:40px; border-radius:8px; font-size:18px; cursor:pointer; }
    .empty-state { text-align:center; padding:40px; color:#6c7787; }
    .empty-state i { font-size:48px; margin-bottom:15px; color:#b5bbc4; }
    @media(max-width:768px) {
      .sidebar { transform:translateX(-100%); }
      .sidebar.open { transform:translateX(0); }
      .main-content { margin-left:0; padding:20px; padding-top:60px; }
      .hamburger-dash { display:block; }
      .charts-grid { grid-template-columns:1fr; }
      .stats-grid { grid-template-columns:repeat(2,1fr); }
      table { font-size:12px; }
      table th, table td { padding:8px 6px; }
    }
    @media(max-width:480px) {
      .stats-grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <button class="hamburger-dash" id="menuToggle"><i class="fas fa-bars"></i></button>
  <aside class="sidebar" id="sidebar">
    <div class="logo">
      <img src="/images/logo.png" alt="Logo">
      <h2>Hospital Management</h2>
    </div>
    <nav>
      <a href="#" class="active" data-tab="overview"><i class="fas fa-th-large"></i> Overview</a>
      <a href="#" data-tab="appointments"><i class="fas fa-calendar-check"></i> Appointments</a>
      <a href="#" data-tab="patients"><i class="fas fa-users"></i> Patients</a>
      <a href="#" data-tab="doctors"><i class="fas fa-user-md"></i> Doctors</a>
      <a href="#" data-tab="payments"><i class="fas fa-credit-card"></i> Payments</a>
      <a href="/" data-tab=""><i class="fas fa-globe"></i> View Website</a>
    </nav>
  </aside>
  <main class="main-content">
    <div class="top-bar">
      <h1 id="pageTitle">Dashboard Overview</h1>
      <div class="user-info">
        <span id="userName">Admin</span>
        <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
      </div>
    </div>

    <!-- Overview Tab -->
    <div class="tab-content active" id="tab-overview">
      <div class="stats-grid">
        <div class="stat-card"><div class="icon green"><i class="fas fa-users"></i></div><h3 id="statPatients">0</h3><p>Total Patients</p></div>
        <div class="stat-card"><div class="icon blue"><i class="fas fa-calendar-check"></i></div><h3 id="statAppointments">0</h3><p>Total Appointments</p></div>
        <div class="stat-card"><div class="icon orange"><i class="fas fa-clock"></i></div><h3 id="statPending">0</h3><p>Pending Appointments</p></div>
        <div class="stat-card"><div class="icon purple"><i class="fas fa-user-md"></i></div><h3 id="statDoctors">0</h3><p>Doctors</p></div>
        <div class="stat-card"><div class="icon green"><i class="fas fa-rupee-sign"></i></div><h3 id="statRevenue">₹0</h3><p>Total Revenue</p></div>
        <div class="stat-card"><div class="icon blue"><i class="fas fa-calendar-day"></i></div><h3 id="statToday">0</h3><p>Today's Appointments</p></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><h3>Appointments (Last 30 Days)</h3><canvas id="appointmentsChart"></canvas></div>
        <div class="chart-card"><h3>Department Distribution</h3><canvas id="departmentsChart"></canvas></div>
        <div class="chart-card"><h3>Revenue (Monthly)</h3><canvas id="revenueChart"></canvas></div>
      </div>
    </div>

    <!-- Appointments Tab -->
    <div class="tab-content" id="tab-appointments">
      <div class="section-card">
        <h3>Appointments <button class="add-btn" onclick="showModal('appointment')"><i class="fas fa-plus"></i> New</button></h3>
        <div class="tab-nav">
          <button class="active" onclick="filterAppointments('')">All</button>
          <button onclick="filterAppointments('pending')">Pending</button>
          <button onclick="filterAppointments('confirmed')">Confirmed</button>
          <button onclick="filterAppointments('completed')">Completed</button>
        </div>
        <div style="overflow-x:auto;"><table><thead><tr><th>Patient</th><th>Department</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead><tbody id="appointmentsTable"></tbody></table></div>
      </div>
    </div>

    <!-- Patients Tab -->
    <div class="tab-content" id="tab-patients">
      <div class="section-card">
        <h3>Patients <button class="add-btn" onclick="showModal('patient')"><i class="fas fa-plus"></i> Add Patient</button></h3>
        <div style="margin-bottom:15px;"><input type="text" id="patientSearch" placeholder="Search patients..." style="padding:10px 15px;border:2px solid #e3ecff;border-radius:8px;width:100%;max-width:300px;outline:none;font-size:14px;"></div>
        <div style="overflow-x:auto;"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Age</th><th>Gender</th><th>Blood Group</th><th>Actions</th></tr></thead><tbody id="patientsTable"></tbody></table></div>
      </div>
    </div>

    <!-- Doctors Tab -->
    <div class="tab-content" id="tab-doctors">
      <div class="section-card">
        <h3>Doctors <button class="add-btn" onclick="showModal('doctor')"><i class="fas fa-plus"></i> Add Doctor</button></h3>
        <div style="overflow-x:auto;"><table><thead><tr><th>Name</th><th>Department</th><th>Specialization</th><th>Phone</th><th>Experience</th><th>Actions</th></tr></thead><tbody id="doctorsTable"></tbody></table></div>
      </div>
    </div>

    <!-- Payments Tab -->
    <div class="tab-content" id="tab-payments">
      <div class="section-card">
        <h3>Payments <button class="add-btn" onclick="showModal('payment')"><i class="fas fa-plus"></i> Record Payment</button></h3>
        <div style="overflow-x:auto;"><table><thead><tr><th>Patient</th><th>Amount</th><th>Description</th><th>Date</th><th>Status</th></tr></thead><tbody id="paymentsTable"></tbody></table></div>
      </div>
    </div>
  </main>

  <!-- Modal -->
  <div class="modal" id="modal">
    <div class="modal-content" id="modalContent"></div>
  </div>

  <script>
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if(!token || user.role !== 'admin') { window.location.href = '/admin/login'; }
    document.getElementById('userName').textContent = user.name || 'Admin';

    const API = (url, opts={}) => fetch(url, {...opts, headers:{...opts.headers, 'Authorization':'Bearer '+token, 'Content-Type':'application/json'}});

    // Tab navigation
    document.querySelectorAll('.sidebar nav a[data-tab]').forEach(a => {
      a.addEventListener('click', (e) => {
        if(!a.dataset.tab) return;
        e.preventDefault();
        document.querySelectorAll('.sidebar nav a').forEach(x=>x.classList.remove('active'));
        a.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
        document.getElementById('tab-'+a.dataset.tab).classList.add('active');
        document.getElementById('pageTitle').textContent = a.textContent.trim();
        document.getElementById('sidebar').classList.remove('open');
        if(a.dataset.tab==='overview') loadDashboard();
        if(a.dataset.tab==='appointments') loadAppointments();
        if(a.dataset.tab==='patients') loadPatients();
        if(a.dataset.tab==='doctors') loadDoctors();
        if(a.dataset.tab==='payments') loadPayments();
      });
    });

    document.getElementById('menuToggle').addEventListener('click', ()=>{ document.getElementById('sidebar').classList.toggle('open'); });

    function logout() { localStorage.clear(); window.location.href='/admin/login'; }

    async function loadDashboard() {
      try {
        const res = await API('/api/dashboard/stats'); const d = await res.json();
        document.getElementById('statPatients').textContent = d.totalPatients;
        document.getElementById('statAppointments').textContent = d.totalAppointments;
        document.getElementById('statPending').textContent = d.pendingAppointments;
        document.getElementById('statDoctors').textContent = d.totalDoctors;
        document.getElementById('statRevenue').textContent = '₹'+(d.revenue||0).toLocaleString();
        document.getElementById('statToday').textContent = d.todayAppointments;
      } catch(e){}
      loadCharts();
    }

    async function loadCharts() {
      try {
        const [aptRes, deptRes, revRes] = await Promise.all([
          API('/api/dashboard/graph/appointments'),
          API('/api/dashboard/graph/departments'),
          API('/api/dashboard/graph/revenue')
        ]);
        const aptData = await aptRes.json();
        const deptData = await deptRes.json();
        const revData = await revRes.json();

        // Appointments chart
        const ctx1 = document.getElementById('appointmentsChart').getContext('2d');
        new Chart(ctx1, { type:'line', data:{ labels:aptData.map(d=>d.date), datasets:[{label:'Appointments', data:aptData.map(d=>d.count), borderColor:'#2c684c', backgroundColor:'rgba(44,104,76,0.1)', fill:true, tension:0.4}] }, options:{responsive:true, plugins:{legend:{display:false}}} });

        // Departments chart
        const ctx2 = document.getElementById('departmentsChart').getContext('2d');
        new Chart(ctx2, { type:'doughnut', data:{ labels:deptData.map(d=>d.department), datasets:[{data:deptData.map(d=>d.count), backgroundColor:['#2c684c','#348061','#6c7e85','#626a7c','#978a7d','#77748b']}] }, options:{responsive:true} });

        // Revenue chart
        const ctx3 = document.getElementById('revenueChart').getContext('2d');
        new Chart(ctx3, { type:'bar', data:{ labels:revData.map(d=>d.month), datasets:[{label:'Revenue (₹)', data:revData.map(d=>d.total), backgroundColor:'#2c684c'}] }, options:{responsive:true, plugins:{legend:{display:false}}} });
      } catch(e){}
    }

    async function loadAppointments(status='') {
      const url = status ? '/api/appointments?status='+status : '/api/appointments?limit=50';
      const res = await API(url); const d = await res.json();
      const tbody = document.getElementById('appointmentsTable');
      if(!d.appointments?.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#999;">No appointments found</td></tr>'; return; }
      tbody.innerHTML = d.appointments.map(a=>'<tr><td>'+(a.patient_name||'N/A')+'</td><td>'+(a.department||'')+'</td><td>'+(a.date||'')+'</td><td>'+(a.time||'')+'</td><td><span class="badge '+(a.status||'')+'">'+(a.status||'')+'</span></td><td><button class="action-btn confirm" onclick="updateAppointment('+a.id+',\\'confirmed\\')">✓</button><button class="action-btn edit" onclick="updateAppointment('+a.id+',\\'completed\\')">Done</button><button class="action-btn delete" onclick="deleteAppointment('+a.id+')">✕</button></td></tr>').join('');
    }
    function filterAppointments(status) { loadAppointments(status); document.querySelectorAll('.tab-nav button').forEach(b=>b.classList.remove('active')); event.target.classList.add('active'); }

    async function loadPatients(search='') {
      const res = await API('/api/patients?limit=50&search='+search); const d = await res.json();
      const tbody = document.getElementById('patientsTable');
      if(!d.patients?.length) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#999;">No patients found</td></tr>'; return; }
      tbody.innerHTML = d.patients.map(p=>'<tr><td>'+p.name+'</td><td>'+(p.phone||'')+'</td><td>'+(p.email||'')+'</td><td>'+(p.age||'')+'</td><td>'+(p.gender||'')+'</td><td>'+(p.blood_group||'')+'</td><td><button class="action-btn delete" onclick="deletePatient('+p.id+')">✕</button></td></tr>').join('');
    }
    document.getElementById('patientSearch')?.addEventListener('input', (e)=>{ loadPatients(e.target.value); });

    async function loadDoctors() {
      const res = await API('/api/doctors'); const d = await res.json();
      const tbody = document.getElementById('doctorsTable');
      if(!d?.length) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#999;">No doctors found</td></tr>'; return; }
      tbody.innerHTML = d.map(doc=>'<tr><td>'+doc.name+'</td><td>'+(doc.department||'')+'</td><td>'+(doc.specialization||'')+'</td><td>'+(doc.phone||'')+'</td><td>'+(doc.experience||0)+' yrs</td><td><button class="action-btn delete" onclick="deleteDoctor('+doc.id+')">✕</button></td></tr>').join('');
    }

    async function loadPayments() {
      const res = await API('/api/payments?limit=50'); const d = await res.json();
      const tbody = document.getElementById('paymentsTable');
      if(!d.payments?.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#999;">No payments found</td></tr>'; return; }
      tbody.innerHTML = d.payments.map(p=>'<tr><td>'+(p.patient_name||'N/A')+'</td><td>₹'+(p.amount||0).toLocaleString()+'</td><td>'+(p.description||'')+'</td><td>'+(p.payment_date||'')+'</td><td><span class="badge '+(p.status||'')+'">'+(p.status||'')+'</span></td></tr>').join('');
    }

    async function updateAppointment(id, status) {
      await API('/api/appointments/'+id, {method:'PUT', body:JSON.stringify({status, date:'', time:'', department:'', doctor_id:null})});
      loadAppointments();
    }
    async function deleteAppointment(id) { if(confirm('Delete this appointment?')) { await API('/api/appointments/'+id, {method:'DELETE'}); loadAppointments(); } }
    async function deletePatient(id) { if(confirm('Delete this patient?')) { await API('/api/patients/'+id, {method:'DELETE'}); loadPatients(); } }
    async function deleteDoctor(id) { if(confirm('Delete this doctor?')) { await API('/api/doctors/'+id, {method:'DELETE'}); loadDoctors(); } }

    function showModal(type) {
      const modal = document.getElementById('modal');
      const content = document.getElementById('modalContent');
      let html = '';
      if(type==='patient') {
        html = '<h3>Add Patient</h3><form onsubmit="addPatient(event)"><div class="form-group"><label>Name</label><input id="m_name" required></div><div class="form-group"><label>Phone</label><input id="m_phone" required></div><div class="form-group"><label>Email</label><input id="m_email" type="email"></div><div class="form-group"><label>Age</label><input id="m_age" type="number"></div><div class="form-group"><label>Gender</label><select id="m_gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div><div class="form-group"><label>Blood Group</label><input id="m_blood"></div><div class="btn-row"><button type="button" class="cancel-btn" onclick="closeModal()">Cancel</button><button type="submit" class="save-btn">Save</button></div></form>';
      } else if(type==='doctor') {
        html = '<h3>Add Doctor</h3><form onsubmit="addDoctor(event)"><div class="form-group"><label>Name</label><input id="m_dname" required></div><div class="form-group"><label>Department</label><select id="m_dept" required><option value="">Select</option><option>Surgery</option><option>Orthopedics</option><option>ENT</option><option>Pediatrics</option><option>Medicine</option><option>Nephrology</option><option>Neurology</option><option>Gastroenterology</option></select></div><div class="form-group"><label>Specialization</label><input id="m_spec"></div><div class="form-group"><label>Phone</label><input id="m_dphone"></div><div class="form-group"><label>Experience (years)</label><input id="m_exp" type="number"></div><div class="btn-row"><button type="button" class="cancel-btn" onclick="closeModal()">Cancel</button><button type="submit" class="save-btn">Save</button></div></form>';
      } else if(type==='appointment') {
        html = '<h3>New Appointment</h3><form onsubmit="addAppointment(event)"><div class="form-group"><label>Patient ID</label><input id="m_pid" type="number" required></div><div class="form-group"><label>Department</label><select id="m_adept" required><option value="">Select</option><option>Surgery</option><option>Orthopedics</option><option>ENT</option><option>Pediatrics</option><option>Medicine</option></select></div><div class="form-group"><label>Date</label><input id="m_adate" type="date" required></div><div class="form-group"><label>Time</label><input id="m_atime" type="time" value="09:00"></div><div class="form-group"><label>Message</label><textarea id="m_amsg" rows="3"></textarea></div><div class="btn-row"><button type="button" class="cancel-btn" onclick="closeModal()">Cancel</button><button type="submit" class="save-btn">Save</button></div></form>';
      } else if(type==='payment') {
        html = '<h3>Record Payment</h3><form onsubmit="addPayment(event)"><div class="form-group"><label>Patient ID</label><input id="m_ppid" type="number" required></div><div class="form-group"><label>Amount (₹)</label><input id="m_pamount" type="number" required></div><div class="form-group"><label>Description</label><input id="m_pdesc"></div><div class="form-group"><label>Date</label><input id="m_pdate" type="date"></div><div class="btn-row"><button type="button" class="cancel-btn" onclick="closeModal()">Cancel</button><button type="submit" class="save-btn">Save</button></div></form>';
      }
      content.innerHTML = html;
      modal.classList.add('active');
    }
    function closeModal() { document.getElementById('modal').classList.remove('active'); }

    async function addPatient(e) { e.preventDefault(); await API('/api/patients',{method:'POST',body:JSON.stringify({name:document.getElementById('m_name').value,phone:document.getElementById('m_phone').value,email:document.getElementById('m_email').value,age:parseInt(document.getElementById('m_age').value)||0,gender:document.getElementById('m_gender').value,blood_group:document.getElementById('m_blood').value})}); closeModal(); loadPatients(); }
    async function addDoctor(e) { e.preventDefault(); await API('/api/doctors',{method:'POST',body:JSON.stringify({name:document.getElementById('m_dname').value,department:document.getElementById('m_dept').value,specialization:document.getElementById('m_spec').value,phone:document.getElementById('m_dphone').value,experience:parseInt(document.getElementById('m_exp').value)||0})}); closeModal(); loadDoctors(); }
    async function addAppointment(e) { e.preventDefault(); await API('/api/appointments',{method:'POST',body:JSON.stringify({patient_id:parseInt(document.getElementById('m_pid').value),department:document.getElementById('m_adept').value,date:document.getElementById('m_adate').value,time:document.getElementById('m_atime').value,message:document.getElementById('m_amsg').value})}); closeModal(); loadAppointments(); }
    async function addPayment(e) { e.preventDefault(); await API('/api/payments',{method:'POST',body:JSON.stringify({patient_id:parseInt(document.getElementById('m_ppid').value),amount:parseFloat(document.getElementById('m_pamount').value),description:document.getElementById('m_pdesc').value,payment_date:document.getElementById('m_pdate').value})}); closeModal(); loadPayments(); }

    // Initial load
    loadDashboard();
  </script>
</body>
</html>`
}

function getPatientDashboardPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patient Dashboard - Radhe Krishna Hospital</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Montserrat',sans-serif; background:#f4f6f8; min-height:100vh; padding:20px; }
    .container { max-width:900px; margin:0 auto; }
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; flex-wrap:wrap; gap:10px; }
    .header h1 { color:#2c684c; font-size:22px; }
    .header .logout-btn { padding:8px 16px; background:#e74c3c; color:white; border:none; border-radius:8px; cursor:pointer; }
    .welcome { background:linear-gradient(135deg,#085737,#2c684c); color:white; border-radius:15px; padding:30px; margin-bottom:25px; }
    .welcome h2 { font-size:20px; margin-bottom:8px; }
    .welcome p { font-size:14px; opacity:0.9; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:15px; margin-bottom:25px; }
    .stat-card { background:white; border-radius:12px; padding:20px; box-shadow:0 2px 10px rgba(0,0,0,0.05); text-align:center; }
    .stat-card h3 { font-size:28px; color:#2c684c; }
    .stat-card p { font-size:13px; color:#6c7787; margin-top:5px; }
    .section { background:white; border-radius:12px; padding:25px; box-shadow:0 2px 10px rgba(0,0,0,0.05); margin-bottom:20px; }
    .section h3 { color:#2c684c; margin-bottom:15px; font-size:16px; }
    table { width:100%; border-collapse:collapse; }
    table th { text-align:left; padding:10px; font-size:12px; color:#6c7787; text-transform:uppercase; border-bottom:2px solid #f4f6f8; }
    table td { padding:10px; font-size:13px; color:#333; border-bottom:1px solid #f4f6f8; }
    .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
    .badge.pending { background:#fff3e0; color:#e65100; }
    .badge.confirmed { background:#e8f5e9; color:#2e7d32; }
    .badge.completed { background:#e3f2fd; color:#1565c0; }
    .back-link { display:inline-block; margin-top:20px; color:#2c684c; text-decoration:none; font-size:14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><i class="fas fa-hospital"></i> Patient Portal</h1>
      <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
    </div>
    <div class="welcome">
      <h2>Welcome, <span id="patientName">Patient</span>!</h2>
      <p>View your appointments and health records here.</p>
    </div>
    <div class="stats">
      <div class="stat-card"><h3 id="myApt">0</h3><p>My Appointments</p></div>
      <div class="stat-card"><h3 id="upApt">0</h3><p>Upcoming</p></div>
    </div>
    <div class="section">
      <h3>My Appointments</h3>
      <div style="overflow-x:auto;"><table><thead><tr><th>Department</th><th>Date</th><th>Time</th><th>Status</th><th>Message</th></tr></thead><tbody id="aptTable"><tr><td colspan="5" style="text-align:center;color:#999;">Loading...</td></tr></tbody></table></div>
    </div>
    <a href="/" class="back-link"><i class="fas fa-arrow-left"></i> Back to Website</a>
  </div>
  <script>
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user')||'{}');
    if(!token || user.role!=='patient') { window.location.href='/patient/login'; }
    document.getElementById('patientName').textContent = user.name||'Patient';

    const API = (url) => fetch(url, {headers:{'Authorization':'Bearer '+token}});

    async function load() {
      try {
        const statsRes = await API('/api/dashboard/stats');
        const stats = await statsRes.json();
        document.getElementById('myApt').textContent = stats.myAppointments||0;
        document.getElementById('upApt').textContent = stats.upcomingAppointments||0;

        const aptRes = await API('/api/appointments?limit=50');
        const aptData = await aptRes.json();
        const tbody = document.getElementById('aptTable');
        if(aptData.appointments?.length) {
          tbody.innerHTML = aptData.appointments.map(a=>'<tr><td>'+(a.department||'')+'</td><td>'+(a.date||'')+'</td><td>'+(a.time||'')+'</td><td><span class="badge '+(a.status||'')+'">'+(a.status||'')+'</span></td><td>'+(a.message||'')+'</td></tr>').join('');
        } else {
          tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#999;">No appointments yet</td></tr>';
        }
      } catch(e) { console.error(e); }
    }
    function logout() { localStorage.clear(); window.location.href='/patient/login'; }
    load();
  </script>
</body>
</html>`
}
