// Generate random sample resume data
export function generateSampleData() {
  const names = [
    'Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Sneha Reddy', 
    'Vikram Singh', 'Ananya Desai', 'Rohit Mehta', 'Kavya Nair'
  ]
  
  const companies = [
    'TechCorp Solutions', 'Digital Innovations', 'CloudTech Systems', 
    'DataSphere Analytics', 'WebCraft Studios', 'AI Solutions Inc'
  ]
  
  const organizations = [
    'Student Council', 'Technical Society', 'Placement Cell', 
    'Cultural Committee', 'Sports Committee', 'Debate Society'
  ]
  
  const titles = [
    'Software Developer Intern', 'Data Science Intern', 'Web Development Intern',
    'Marketing Intern', 'Product Management Intern', 'UI/UX Design Intern'
  ]
  
  const positions = [
    'Executive Member', 'Core Team Member', 'Coordinator', 
    'Team Lead', 'Vice President', 'Secretary'
  ]
  
  const randomName = names[Math.floor(Math.random() * names.length)]
  const randomEmail = `${randomName.toLowerCase().replace(/\s+/g, '.')}@example.com`
  const randomPhone = `+91 ${Math.floor(9000000000 + Math.random() * 1000000000)}`
  const randomLinkedIn = `https://www.linkedin.com/in/${randomName.toLowerCase().replace(/\s+/g, '-')}`
  const randomAge = Math.floor(18 + Math.random() * 5).toString()
  
  return {
    name: randomName,
    email: randomEmail,
    phone: randomPhone,
    linkedin: randomLinkedIn,
    age: randomAge,
    education: [
      {
        year: '2029',
        qualification: 'B.Sc. Computer Science (Hons.)',
        institute: 'Sri Guru Tegh Bahadur Khalsa College, University of Delhi',
        cgpa: '-'
      },
      {
        year: '2024',
        qualification: 'Class XII (CBSE)',
        institute: 'Delhi Public School, New Delhi',
        cgpa: `${(75 + Math.random() * 20).toFixed(1)}%`
      },
      {
        year: '2022',
        qualification: 'Class X (CBSE)',
        institute: 'Delhi Public School, New Delhi',
        cgpa: `${(75 + Math.random() * 20).toFixed(1)}%`
      }
    ],
    internships: [
      {
        title: 'Digital Marketing Executive',
        company: 'Athletic Fever',
        period: `Aug'25 – Present`,
        description: `Designed and developed a responsive website for Athletic Fever, targeting sponsorship outreach. Successfully organized "Anytime Fitness Showdown" sports event at Mayur Vihar with strong participation. Coordinated with multi-college members to enhance branding, promotions, and sponsor engagement.`
      }
    ],
    positions: [
      {
        title: 'Executive Member',
        organization: 'Ignite – The Placement Cell',
        period: `Sep'25 – Present`,
        description: `Selected from a competitive pool of over 450 candidates for the Ignite placement cell. Assisted in planning, coordinating, and conducting campus placement and internship recruitment drives. Helped organize and manage multiple speaker sessions, each engaging 100+ active participants.`
      },
      {
        title: 'Web Developer',
        organization: 'RayanMarketing',
        period: `Jul'25 – Present`,
        description: `Developed and maintained responsive web pages for RayanMarketing using React and Tailwind CSS. Collaborated with marketing teams to build websites supporting multiple client companies and campaigns. Enhanced front-end performance and user experience through optimized design and clean code practices. Strengthened coding skills in React ecosystem and Tailwind by delivering real-world client projects.`
      }
    ],
    extraCurriculars: `Web Development (React, Tailwind CSS) – Developed websites for RayanMarketing and personal portfolio project. Startup Tech Contribution – Built Athletic Fever website, supporting inter-college and open sports tournaments. Full-Stack Development – Created a web application for storing and managing code snippets. Chrome Extension Development – Made multiple extensions on Chrome Web Store using JavaScript. Machine Learning & AI – Designed a face recognition system, available on GitHub. Event Management & Leadership – Organized sports events and collaborated with cross-college teams for execution.`,
    academicAchievements: `Secured 140th rank in IPU-CET (BCA) entrance examination, among thousands of candidates. Successfully cleared IIT Hyderabad's entrance exam for certification in Artificial Intelligence & Machine Learning. Demonstrated consistent excellence in STEM subjects, with strong analytical reasoning and programming fundamentals. Achieved 96/100 in Computer Science (CBSE Class XII).`,
    skills: `Soft Skills: Communication & Public Speaking – Conveying ideas clearly and engaging audiences effectively. Team Management & Leadership – Coordinating groups, motivating teams, and driving success. Time Management & Productivity – Prioritizing tasks efficiently to meet strict deadlines. Technical Skills: Programming (Python, JavaScript) – Writing efficient code for automation and applications. Web Development (ReactJS, Tailwind CSS) – Building responsive, modern, and scalable interfaces. Databases (MySQL) – Designing, querying, and managing structured relational data. Tools (GitHub, REST APIs) – Collaborating on projects and integrating backend services.`
  }
}

