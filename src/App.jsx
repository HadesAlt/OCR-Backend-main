import React, { useState } from 'react'
import ResumeForm from './components/ResumeForm'
import ResumePreview from './components/ResumePreview'
import { formatResumeContent } from './utils/formatting'
import './App.css'

function App() {
  const [resumeData, setResumeData] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const handleFormSubmit = (data) => {
    const formattedData = formatResumeContent(data)
    setResumeData(formattedData)
    setShowPreview(true)
  }

  const handleEdit = () => {
    setShowPreview(false)
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="app-title">Resume Builder</h1>
        <p className="app-subtitle">Create your resume in the standard college format</p>
        
        {!showPreview ? (
          <ResumeForm onSubmit={handleFormSubmit} />
        ) : (
          <ResumePreview 
            resumeData={resumeData} 
            onEdit={handleEdit}
            originalData={resumeData}
          />
        )}
      </div>
    </div>
  )
}

export default App

