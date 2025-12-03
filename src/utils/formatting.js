
const ACTION_VERBS = [
  'designed', 'developed', 'built', 'organized', 'coordinated',
  'assisted', 'managed', 'enhanced', 'strengthened', 'collaborated',
  'achieved', 'secured', 'cleared', 'demonstrated', 
  'planning', 'conducting', 'successfully'
]

const TECHNICAL_TERMS = [
  'react', 'tailwind css', 'javascript', 'python', 'mysql', 'github',
  'responsive', 'website', 'web pages',
  'machine learning', 'artificial intelligence', 'ai',
  'reactjs', 'react ecosystem', 'tailwind'
]

const IMPORTANT_TERMS = [
  'sponsorship', 'multi-college members',
  'campus placement', 'internship recruitment', 
  'multiple speaker sessions', 'active participants',
  'marketing teams', 'multiple client companies',
  'front-end performance', 'optimized design', 'clean code',
  'ignite placement cell', 'competitive pool'
]


export function boldKeywords(text) {
  if (!text) return ''
  
  let formattedText = text
  
  
  const allKeywords = [
    ...ACTION_VERBS,
    ...TECHNICAL_TERMS,
    ...IMPORTANT_TERMS
  ]
  
  
  allKeywords.sort((a, b) => b.length - a.length)
  
  
  const boldedRanges = []
  
  
  allKeywords.forEach(keyword => {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi')
    
    let match
    while ((match = regex.exec(formattedText)) !== null) {
      const start = match.index
      const end = start + match[0].length
      
      
      const overlaps = boldedRanges.some(range => 
        (start >= range.start && start < range.end) ||
        (end > range.start && end <= range.end) ||
        (start <= range.start && end >= range.end)
      )
      
      if (!overlaps) {
        
        const before = formattedText.substring(Math.max(0, start - 2), start)
        const after = formattedText.substring(end, Math.min(formattedText.length, end + 2))
        
        if (before !== '**' || after !== '**') {
          boldedRanges.push({ start, end })
        }
      }
    }
  })
  
  
  boldedRanges.sort((a, b) => b.start - a.start)
  
  
  boldedRanges.forEach(range => {
    const textToBold = formattedText.substring(range.start, range.end)
    formattedText = formattedText.substring(0, range.start) + 
                    `**${textToBold}**` + 
                    formattedText.substring(range.end)
  })
  
  
  formattedText = formattedText.replace(/\b(\d+[+\-%]?|\d+th|\d+rd|\d+nd|\d+st|\d+\/\d+)\b/g, (match) => {
    
    if (match.includes('**')) {
      return match
    }
    return `**${match}**`
  })
  
  
  formattedText = formattedText.replace(/"([^"]+)"/g, (match, quoteText) => {
    
    if (match.startsWith('**"')) {
      return match
    }
    return `**"${quoteText}"**`
  })
  
  
  formattedText = formattedText.replace(/\*\*\*\*+/g, '**')
  
  return formattedText
}


export function formatEducation(education) {
  return education.map(edu => ({
    year: edu.year || '',
    qualification: edu.qualification || '',
    institute: edu.institute || '',
    cgpa: edu.cgpa || ''
  }))
}


export function formatInternship(internships) {
  return internships.map(int => ({
    title: int.title || '',
    company: int.company || '',
    period: int.period || '',
    description: boldKeywords(int.description || '')
  }))
}


export function formatPositions(positions) {
  return positions.map(pos => ({
    title: pos.title || '',
    organization: pos.organization || '',
    period: pos.period || '',
    description: boldKeywords(pos.description || '')
  }))
}


export function formatExtraCurriculars(extraCurriculars) {
  if (!extraCurriculars) return ''
  
  
  if (typeof extraCurriculars === 'string') {
    return boldKeywords(extraCurriculars)
  }
  
  
  if (Array.isArray(extraCurriculars)) {
    return extraCurriculars.map(item => {
      const category = item.category || ''
      const description = item.description || ''
      const combined = `${category} - ${description}`
      return boldKeywords(combined)
    }).join('. ')
  }
  
  return ''
}


export function formatAcademicAchievements(achievements) {
  if (!achievements) return ''
  
  
  if (typeof achievements === 'string') {
    return boldKeywords(achievements)
  }
  
  
  if (Array.isArray(achievements)) {
    return achievements.map(achievement => boldKeywords(achievement)).join('. ')
  }
  
  return ''
}


export function formatSkills(skills) {
  if (!skills) return ''
  
  
  if (typeof skills === 'string') {
    return boldKeywords(skills)
  }
  
  
  let formatted = ''
  
  if (skills.softSkills && skills.softSkills.length > 0) {
    formatted += '**Soft Skills:** '
    const softSkillsFormatted = skills.softSkills.map(skill => {
      const name = skill.name || ''
      const description = skill.description || ''
      const combined = `${name} - ${description}`
      return boldKeywords(combined)
    }).join('. ')
    formatted += softSkillsFormatted
  }
  
  if (skills.technicalSkills && skills.technicalSkills.length > 0) {
    if (formatted) formatted += '. '
    formatted += '**Technical Skills:** '
    const techSkillsFormatted = skills.technicalSkills.map(skill => {
      const name = skill.name || ''
      const description = skill.description || ''
      const combined = `${name} - ${description}`
      return boldKeywords(combined)
    }).join('. ')
    formatted += techSkillsFormatted
  }
  
  return formatted
}


export function formatResumeContent(data) {
  return {
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    linkedin: data.linkedin || '',
    age: data.age || '',
    education: formatEducation(data.education || []),
    internships: formatInternship(data.internships || []),
    positions: formatPositions(data.positions || []),
    extraCurriculars: formatExtraCurriculars(data.extraCurriculars || ''),
    academicAchievements: formatAcademicAchievements(data.academicAchievements || ''),
    skills: formatSkills(data.skills || '')
  }
}
