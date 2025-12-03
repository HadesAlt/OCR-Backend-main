import React, { useState } from 'react'
import { generateSampleData } from '../utils/sampleData'
import './ResumeForm.css'

function ResumeForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    linkedin: '',
    age: '',
    education: [{ year: '', qualification: '', institute: '', cgpa: '' }],
    internships: [{ title: '', company: '', period: '', description: '' }],
    positions: [{ title: '', organization: '', period: '', description: '' }],
    extraCurriculars: '',
    academicAchievements: '',
    skills: ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleEducationChange = (index, field, value) => {
    const newEducation = [...formData.education]
    newEducation[index][field] = value
    setFormData(prev => ({ ...prev, education: newEducation }))
  }

  const addEducation = () => {
    setFormData(prev => ({
      ...prev,
      education: [...prev.education, { year: '', qualification: '', institute: '', cgpa: '' }]
    }))
  }

  const handleInternshipChange = (index, field, value) => {
    const newInternships = [...formData.internships]
    newInternships[index][field] = value
    setFormData(prev => ({ ...prev, internships: newInternships }))
  }

  const addInternship = () => {
    setFormData(prev => ({
      ...prev,
      internships: [...prev.internships, { title: '', company: '', period: '', description: '' }]
    }))
  }

  const handlePositionChange = (index, field, value) => {
    const newPositions = [...formData.positions]
    newPositions[index][field] = value
    setFormData(prev => ({ ...prev, positions: newPositions }))
  }

  const addPosition = () => {
    setFormData(prev => ({
      ...prev,
      positions: [...prev.positions, { title: '', organization: '', period: '', description: '' }]
    }))
  }


  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="resume-form">
      <div className="form-section">
        <h2>Personal Information</h2>
        <div className="form-grid">
          <div className="form-group">
            <label>Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Phone *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>LinkedIn URL</label>
            <input
              type="url"
              name="linkedin"
              value={formData.linkedin}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Age</label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h2>Education</h2>
        {formData.education.map((edu, index) => (
          <div key={index} className="form-group-row">
            <input
              type="text"
              placeholder="Year (e.g., 2029)"
              value={edu.year}
              onChange={(e) => handleEducationChange(index, 'year', e.target.value)}
            />
            <input
              type="text"
              placeholder="Qualification (e.g., B.sc. CS (Hons.))"
              value={edu.qualification}
              onChange={(e) => handleEducationChange(index, 'qualification', e.target.value)}
            />
            <input
              type="text"
              placeholder="Institute/School"
              value={edu.institute}
              onChange={(e) => handleEducationChange(index, 'institute', e.target.value)}
            />
            <input
              type="text"
              placeholder="% / CGPA"
              value={edu.cgpa}
              onChange={(e) => handleEducationChange(index, 'cgpa', e.target.value)}
            />
          </div>
        ))}
        <button type="button" onClick={addEducation} className="add-btn">+ Add Education</button>
      </div>

      <div className="form-section">
        <h2>Internships</h2>
        {formData.internships.map((int, index) => (
          <div key={index} className="form-group-block">
            <div className="form-group-row">
              <input
                type="text"
                placeholder="Title (e.g., Digital Marketing Executive)"
                value={int.title}
                onChange={(e) => handleInternshipChange(index, 'title', e.target.value)}
              />
              <input
                type="text"
                placeholder="Company Name"
                value={int.company}
                onChange={(e) => handleInternshipChange(index, 'company', e.target.value)}
              />
              <input
                type="text"
                placeholder="Period (e.g., Aug'25 - Present)"
                value={int.period}
                onChange={(e) => handleInternshipChange(index, 'period', e.target.value)}
              />
            </div>
            <textarea
              placeholder="Description (keywords will be automatically bolded)"
              value={int.description}
              onChange={(e) => handleInternshipChange(index, 'description', e.target.value)}
              rows="3"
            />
          </div>
        ))}
        <button type="button" onClick={addInternship} className="add-btn">+ Add Internship</button>
      </div>

      <div className="form-section">
        <h2>Positions of Responsibility</h2>
        {formData.positions.map((pos, index) => (
          <div key={index} className="form-group-block">
            <div className="form-group-row">
              <input
                type="text"
                placeholder="Title (e.g., Executive Member)"
                value={pos.title}
                onChange={(e) => handlePositionChange(index, 'title', e.target.value)}
              />
              <input
                type="text"
                placeholder="Organization"
                value={pos.organization}
                onChange={(e) => handlePositionChange(index, 'organization', e.target.value)}
              />
              <input
                type="text"
                placeholder="Period (e.g., Sep'25 - Present)"
                value={pos.period}
                onChange={(e) => handlePositionChange(index, 'period', e.target.value)}
              />
            </div>
            <textarea
              placeholder="Description (keywords will be automatically bolded)"
              value={pos.description}
              onChange={(e) => handlePositionChange(index, 'description', e.target.value)}
              rows="3"
            />
          </div>
        ))}
        <button type="button" onClick={addPosition} className="add-btn">+ Add Position</button>
      </div>

      <div className="form-section">
        <h2>Extra-Curriculars, Achievements and Skills</h2>
        <textarea
          name="extraCurriculars"
          placeholder="Enter each achievement as a sentence. Example: Web Development (React, Tailwind CSS) – Developed websites for RayanMarketing and personal portfolio project. Startup Tech Contribution – Built Athletic Fever website. Full-Stack Development – Created a web application for storing and managing code snippets."
          value={formData.extraCurriculars}
          onChange={handleChange}
          rows="6"
        />
        <p className="helper-text">Separate achievements with periods. Bold keywords will be automatically applied.</p>
      </div>

      <div className="form-section">
        <h2>Academic Achievements</h2>
        <textarea
          name="academicAchievements"
          placeholder="Enter each achievement as a sentence. Example: Secured 140th rank in IPU-CET (BCA) entrance examination, among thousands of candidates. Successfully cleared IIT Hyderabad's entrance exam for certification in Artificial Intelligence & Machine Learning."
          value={formData.academicAchievements}
          onChange={handleChange}
          rows="6"
        />
        <p className="helper-text">Separate achievements with periods. Bold keywords will be automatically applied.</p>
      </div>

      <div className="form-section">
        <h2>Skills</h2>
        <textarea
          name="skills"
          placeholder="Enter skills with sub-headers. Example: Soft Skills: Communication & Public Speaking – Conveying ideas clearly and engaging audiences effectively. Team Management & Leadership – Coordinating groups, motivating teams, and driving success. Technical Skills: Programming (Python, JavaScript) – Writing efficient code for automation and applications."
          value={formData.skills}
          onChange={handleChange}
          rows="10"
        />
        <p className="helper-text">Use 'Soft Skills:' and 'Technical Skills:' as sub-headers (13pt bold). Separate skills with periods.</p>
      </div>

      <div className="form-actions">
        <button 
          type="button" 
          onClick={() => setFormData(generateSampleData())} 
          className="sample-btn"
        >
          Fill with Sample Data
        </button>
        <button type="submit" className="submit-btn">Generate Resume</button>
      </div>
    </form>
  )
}

export default ResumeForm

