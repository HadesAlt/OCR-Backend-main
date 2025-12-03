import React, { useRef, useState } from 'react'
import { exportToPDF, exportToDOCX } from '../utils/export'
import './ResumePreview.css'

function ResumePreview({ resumeData, onEdit, originalData }) {
  const resumeRef = useRef(null)
  const [fontSize, setFontSize] = useState(100) // 100% default

  const formatText = (text, isSkills = false) => {
    if (!text) return ''
    
    // For Skills section, handle sub-headers specially
    if (isSkills) {
      let html = ''
      
      // Split by "Soft Skills:" and "Technical Skills:"
      const parts = text.split(/(Soft Skills:|Technical Skills:)/).filter(p => p.trim())
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        
        if (part === 'Soft Skills:' || part === 'Technical Skills:') {
          // Add sub-header
          html += `<p class="skills-subheader">${part}</p>`
        } else {
          // This is content - split into bullets
          const withBold = part.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          const sentences = withBold.split('. ').filter(s => s.trim())
          
          if (sentences.length > 0) {
            html += '<ul>'
            sentences.forEach(sentence => {
              const trimmed = sentence.trim()
              if (trimmed) {
                html += `<li>${trimmed}${trimmed.endsWith('.') ? '' : '.'}</li>`
              }
            })
            html += '</ul>'
          }
        }
      }
      
      return html
    }
    
    // Regular sections (non-skills)
    // Replace bold markers
    const withBold = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    
    // Split by periods to create bullet points
    const sentences = withBold.split('. ')
      .filter(s => s.trim())
      .map(s => s.trim() + (s.endsWith('.') ? '' : '.'))
    
    // Create HTML list
    if (sentences.length > 0) {
      return '<ul>' + sentences.map(s => `<li>${s}</li>`).join('') + '</ul>'
    }
    
    return withBold
  }

  const handleExportPDF = () => {
    exportToPDF(resumeRef.current, `${resumeData.name || 'resume'}.pdf`)
  }

  const handleExportDOCX = () => {
    exportToDOCX(resumeData, originalData, `${resumeData.name || 'resume'}.docx`)
  }

  return (
    <div className="preview-container">
      <div className="preview-actions">
        <button onClick={onEdit} className="edit-btn">✏️ Edit Resume</button>
        <div className="font-size-control">
          <label>Font Size: {fontSize}%</label>
          <button onClick={() => setFontSize(Math.max(70, fontSize - 5))} className="size-btn">−</button>
          <button onClick={() => setFontSize(100)} className="size-btn">Reset</button>
          <button onClick={() => setFontSize(Math.min(120, fontSize + 5))} className="size-btn">+</button>
        </div>
        <button onClick={handleExportPDF} className="export-btn">📄 Download PDF</button>
        <button onClick={handleExportDOCX} className="export-btn">📝 Download DOCX</button>
      </div>

      <div ref={resumeRef} className="resume-preview" style={{ fontSize: `${fontSize}%` }}>
        {/* Header - Name LEFT, Contact RIGHT */}
        <div className="resume-header">
          <h1 className="resume-name">{resumeData.name}</h1>
          <div className="resume-contact">
            <a href={`mailto:${resumeData.email}`}>{resumeData.email}</a>
            {resumeData.phone && <span> | {resumeData.phone}</span>}
            <br />
            {resumeData.linkedin && (
              <a href={resumeData.linkedin} target="_blank" rel="noopener noreferrer">
                {resumeData.linkedin}
              </a>
            )}
            {resumeData.age && <span> | {resumeData.age}</span>}
          </div>
        </div>

        {/* Education Section - Only show if user has education data */}
        {resumeData.education && resumeData.education.length > 0 && resumeData.education.some(edu => edu.year || edu.qualification || edu.institute || edu.cgpa) && (
          <table className="resume-table education-table">
            <thead>
              <tr>
                <th colSpan="4" className="section-title">EDUCATION:</th>
              </tr>
              <tr>
                <th>Year</th>
                <th>Qualification</th>
                <th>Institute/School</th>
                <th>% / CGPA</th>
              </tr>
            </thead>
            <tbody>
              {resumeData.education.map((edu, index) => (
                <tr key={index}>
                  <td style={{ textAlign: 'center' }}>{edu.year}</td>
                  <td style={{ textAlign: 'left' }}>{edu.qualification}</td>
                  <td style={{ textAlign: 'center' }}>{edu.institute}</td>
                  <td style={{ textAlign: 'center' }}>{edu.cgpa || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Internship Section - Only show if user has internship data */}
        {resumeData.internships && resumeData.internships.length > 0 && resumeData.internships.some(int => int.company || int.title || int.description) && (
          <table className="resume-table two-column-table">
            <thead>
              <tr>
                <th colSpan="2" className="section-title">INTERNSHIP:</th>
              </tr>
            </thead>
            <tbody>
              {resumeData.internships.map((int, index) => (
                <tr key={index}>
                  <td className="title-cell">
                    <div><strong>{int.company}</strong></div>
                    <div><strong>{int.title}</strong></div>
                    {int.period && <div>({int.period})</div>}
                  </td>
                  <td 
                    className="description-cell" 
                    dangerouslySetInnerHTML={{ __html: formatText(int.description) }} 
                  />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Positions of Responsibility Section - Only show if user has positions data */}
        {resumeData.positions && resumeData.positions.length > 0 && resumeData.positions.some(pos => pos.organization || pos.title || pos.description) && (
          <table className="resume-table two-column-table">
            <thead>
              <tr>
                <th colSpan="2" className="section-title">POSITIONS OF RESPONSIBILITY:</th>
              </tr>
            </thead>
            <tbody>
              {resumeData.positions.map((pos, index) => (
                <tr key={index}>
                  <td className="title-cell">
                    <div><strong>{pos.organization}</strong></div>
                    <div><strong>{pos.title}</strong></div>
                    {pos.period && <div>({pos.period})</div>}
                  </td>
                  <td 
                    className="description-cell" 
                    dangerouslySetInnerHTML={{ __html: formatText(pos.description) }} 
                  />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Extra-Curriculars Section - Only show if user has data */}
        {resumeData.extraCurriculars && resumeData.extraCurriculars.trim() && (
          <table className="resume-table single-column-table">
            <thead>
              <tr>
                <th className="section-title">EXTRA-CURRICULARS ACHIEVEMENTS AND SKILLS:</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td dangerouslySetInnerHTML={{ __html: formatText(resumeData.extraCurriculars) }} />
              </tr>
            </tbody>
          </table>
        )}

        {/* Academic Achievements Section - Only show if user has data */}
        {resumeData.academicAchievements && resumeData.academicAchievements.trim() && (
          <table className="resume-table single-column-table">
            <thead>
              <tr>
                <th className="section-title">ACADEMIC ACHIEVEMENTS:</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td dangerouslySetInnerHTML={{ __html: formatText(resumeData.academicAchievements) }} />
              </tr>
            </tbody>
          </table>
        )}

        {/* Skills Section - Only show if user has data */}
        {resumeData.skills && resumeData.skills.trim() && (
          <table className="resume-table single-column-table">
            <thead>
              <tr>
                <th className="section-title blue-bg">SKILLS:</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td dangerouslySetInnerHTML={{ __html: formatText(resumeData.skills, true) }} />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default ResumePreview
