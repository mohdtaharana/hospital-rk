-- Admin user: Taharana / Taharana@123
INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES 
  ('Taharana', 'Taharana@123', 'Taharana', 'admin@radhekrishna.com', 'admin');

-- Sample patient user
INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES 
  ('patient1', 'patient123', 'Rahul Sharma', 'rahul@email.com', 'patient');

-- Sample Doctors
INSERT OR IGNORE INTO doctors (name, department, specialization, phone, experience) VALUES 
  ('Dr. Anil Kumar', 'Surgery', 'General Surgery', '9876543210', 15),
  ('Dr. Priya Singh', 'Orthopedics', 'Joint Replacement', '9876543211', 12),
  ('Dr. Rajesh Verma', 'ENT', 'Head & Neck Surgery', '9876543212', 10),
  ('Dr. Meena Patel', 'Pediatrics', 'Neonatal Care', '9876543213', 8),
  ('Dr. Suresh Gupta', 'Medicine', 'Internal Medicine', '9876543214', 20),
  ('Dr. Neha Sharma', 'Nephrology', 'Dialysis', '9876543215', 7),
  ('Dr. Vikram Joshi', 'Neurology', 'Stroke Care', '9876543216', 14),
  ('Dr. Kavita Reddy', 'Gastroenterology', 'Endoscopy', '9876543217', 9);

-- Sample Patients
INSERT OR IGNORE INTO patients (name, email, phone, age, gender, blood_group) VALUES 
  ('Rahul Sharma', 'rahul@email.com', '9988776655', 35, 'Male', 'B+'),
  ('Priyanka Gupta', 'priyanka@email.com', '9988776656', 28, 'Female', 'A+'),
  ('Amit Kumar', 'amit@email.com', '9988776657', 45, 'Male', 'O+'),
  ('Sunita Devi', 'sunita@email.com', '9988776658', 52, 'Female', 'AB+'),
  ('Ravi Tiwari', 'ravi@email.com', '9988776659', 30, 'Male', 'B-'),
  ('Anita Rao', 'anita@email.com', '9988776660', 40, 'Female', 'A-'),
  ('Deepak Mishra', 'deepak@email.com', '9988776661', 60, 'Male', 'O-'),
  ('Suman Pandey', 'suman@email.com', '9988776662', 25, 'Female', 'B+'),
  ('Mohan Lal', 'mohan@email.com', '9988776663', 55, 'Male', 'A+'),
  ('Geeta Arora', 'geeta@email.com', '9988776664', 33, 'Female', 'AB-');

-- Sample Appointments
INSERT OR IGNORE INTO appointments (patient_id, doctor_id, department, date, time, message, status) VALUES 
  (1, 1, 'Surgery', '2026-06-10', '10:00', 'Follow-up consultation', 'confirmed'),
  (2, 2, 'Orthopedics', '2026-06-10', '11:00', 'Knee pain examination', 'confirmed'),
  (3, 3, 'ENT', '2026-06-11', '09:30', 'Ear infection treatment', 'pending'),
  (4, 5, 'Medicine', '2026-06-11', '14:00', 'General checkup', 'pending'),
  (5, 4, 'Pediatrics', '2026-06-12', '10:30', 'Child vaccination', 'pending'),
  (6, 6, 'Nephrology', '2026-06-12', '15:00', 'Kidney function test', 'confirmed'),
  (7, 7, 'Neurology', '2026-06-13', '09:00', 'Headache consultation', 'pending'),
  (8, 8, 'Gastroenterology', '2026-06-13', '11:30', 'Stomach pain', 'pending'),
  (1, 5, 'Medicine', '2026-06-08', '10:00', 'Blood test results', 'completed'),
  (2, 1, 'Surgery', '2026-06-07', '14:30', 'Post-surgery checkup', 'completed'),
  (3, 2, 'Orthopedics', '2026-06-06', '09:00', 'X-ray review', 'completed'),
  (9, 3, 'ENT', '2026-06-14', '10:00', 'Throat pain', 'pending'),
  (10, 4, 'Pediatrics', '2026-06-14', '14:00', 'Child fever', 'pending');

-- Sample Payments
INSERT OR IGNORE INTO payments (patient_id, amount, description, payment_date, status) VALUES 
  (1, 2500, 'Consultation Fee - Surgery', '2026-06-08', 'completed'),
  (2, 1800, 'X-Ray + Consultation', '2026-06-07', 'completed'),
  (3, 3500, 'ENT Procedure', '2026-06-06', 'completed'),
  (4, 1200, 'General Checkup', '2026-06-05', 'completed'),
  (5, 800, 'Vaccination', '2026-06-04', 'completed'),
  (6, 5000, 'Kidney Function Test', '2026-06-03', 'completed'),
  (7, 2000, 'Neurology Consultation', '2026-06-02', 'completed'),
  (8, 1500, 'Endoscopy', '2026-06-01', 'completed'),
  (9, 1000, 'ENT Consultation', '2026-05-30', 'completed'),
  (10, 900, 'Pediatric Consultation', '2026-05-29', 'completed'),
  (1, 4500, 'Surgery Follow-up', '2026-05-25', 'completed'),
  (2, 2200, 'Orthopedic Brace', '2026-05-20', 'completed');
