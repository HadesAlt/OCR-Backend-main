# Resume Builder - College Format

An AI-powered resume builder that automatically creates resumes in the standard college format with perfect formatting, spacing, and keyword bolding.

## Features

- ✅ **Automatic Formatting**: AI automatically bolds keywords, action verbs, technical terms, and numbers
- ✅ **Exact Format Match**: Generates resumes matching the exact college standard format
- ✅ **Multiple Export Options**: Export to PDF or DOCX
- ✅ **Smart Keyword Detection**: Automatically identifies and bolds important terms like:
  - Action verbs (designed, developed, organized, etc.)
  - Technical terms (React, JavaScript, Python, etc.)
  - Numbers and statistics (100+, 450 candidates, etc.)
  - Important phrases and achievements

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Fill in all the required information in the form:
   - Personal Information (Name, Email, Phone, LinkedIn, Age)
   - Education (Year, Qualification, Institute, CGPA)
   - Internships (Title, Company, Period, Description)
   - Positions of Responsibility (Title, Organization, Period, Description)
   - Extra-Curriculars, Achievements and Skills
   - Academic Achievements
   - Skills (Soft Skills and Technical Skills)

2. Click "Generate Resume" to preview your formatted resume

3. Review the preview - all keywords will be automatically bolded

4. Export to PDF or DOCX format

## Formatting Rules

The system automatically bolds:
- **Action verbs**: designed, developed, created, organized, coordinated, etc.
- **Technical terms**: React, JavaScript, Python, MySQL, GitHub, etc.
- **Numbers**: 100+, 450 candidates, 96/100, etc.
- **Important phrases**: website, sponsorship, campus placement, etc.
- **Quoted text**: "Anytime Fitness Showdown", etc.

## Technologies Used

- React 18
- Vite
- jsPDF (PDF export)
- html2canvas (PDF rendering)
- docx (DOCX export)
- File Saver (File downloads)

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── ResumeForm.jsx      # Form for collecting resume data
│   │   ├── ResumeForm.css
│   │   ├── ResumePreview.jsx   # Preview component
│   │   └── ResumePreview.css
│   ├── utils/
│   │   ├── formatting.js       # Keyword bolding logic
│   │   └── export.js           # PDF/DOCX export functions
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   └── index.css
├── package.json
└── vite.config.js
```

## Notes

- The resume format matches the exact college standard format
- All spacing, bold formatting, and table structures are automatically handled
- Keywords are detected and bolded automatically - no manual formatting needed
- The preview shows exactly how the exported resume will look

