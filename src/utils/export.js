import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
  WidthType, AlignmentType, BorderStyle, VerticalAlign 
} from 'docx'
import { saveAs } from 'file-saver'


function addText(pdf, text, x, y, options = {}) {
  const { bold = false, fontSize = 11, align = 'left', maxWidth = null } = options
  
  if (bold) pdf.setFont('helvetica', 'bold')
  else pdf.setFont('helvetica', 'normal')
  
  pdf.setFontSize(fontSize)
  
  if (maxWidth) {
    const lines = pdf.splitTextToSize(text, maxWidth)
    pdf.text(lines, x, y, { align })
    return lines.length * (fontSize * 0.5) 
  } else {
    pdf.text(text, x, y, { align })
    return fontSize * 0.5
  }
}


export async function exportToPDF(element, filename) {
  try {
    const canvas = await html2canvas(element, {
      scale: 2, 
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    })

    const pdfWidth = 210 
    const pdfHeight = 297 
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * pdfWidth) / canvas.width
    
    
    if (imgHeight <= pdfHeight) {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
    } else {
      
      const scaleFactor = pdfHeight / imgHeight
      const scaledWidth = imgWidth * scaleFactor
      const scaledHeight = pdfHeight
      const xOffset = (pdfWidth - scaledWidth) / 2 
      
      pdf.addImage(imgData, 'PNG', xOffset, 0, scaledWidth, scaledHeight)
    }
    
    pdf.save(filename)
  } catch (error) {
    console.error('Error exporting to PDF:', error)
    alert('Error exporting to PDF. Please try again.')
  }
}


function parseBoldText(text) {
  if (!text) return [new TextRun('')]
  
  const parts = []
  const regex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(new TextRun({
        text: text.substring(lastIndex, match.index),
        size: 17
      }))
    }
    parts.push(new TextRun({
      text: match[1],
      bold: true,
      size: 17
    }))
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(new TextRun({
      text: text.substring(lastIndex),
      size: 17
    }))
  }

  return parts.length > 0 ? parts : [new TextRun({ text, size: 17 })]
}


function splitIntoBullets(text) {
  if (!text) return []
  const sentences = text.split(/\.\s+/)
  return sentences
    .filter(s => s.trim())
    .map(s => s.trim() + (s.endsWith('.') ? '' : '.'))
}


export async function exportToDOCX(resumeData, originalData, filename) {
  try {
    const children = []

    
    const headerTable = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({
                    text: resumeData.name.toUpperCase(),
                    bold: true,
                    size: 48
                  })],
                  alignment: AlignmentType.LEFT
                })
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: resumeData.email, color: '1155cc', size: 20 }),
                    new TextRun({ text: ` |${resumeData.phone || ''}`, size: 20 }),
                    ...(resumeData.linkedin ? [new TextRun({ text: ' ', size: 20 }), new TextRun({ text: resumeData.linkedin, color: '1155cc', size: 20 })] : []),
                    ...(resumeData.age ? [new TextRun({ text: ` |${resumeData.age}`, size: 20 })] : [])
                  ],
                  alignment: AlignmentType.RIGHT
                })
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
            })
          ]
        })
      ],
      width: { size: 100, type: WidthType.PERCENTAGE }
    })

    children.push(headerTable)
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    
    if (resumeData.education && resumeData.education.length > 0) {
      const eduRows = [
        
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'EDUCATION:', bold: true, color: 'FFFFFF', size: 22 })] })],
              columnSpan: 4,
              shading: { fill: '1f487c' },
              borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
            })
          ]
        }),
        
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Year', bold: true, size: 22 })], alignment: AlignmentType.CENTER })], shading: { fill: 'd9d9d9' }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }, width: { size: 10, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Qualification', bold: true, size: 22 })], alignment: AlignmentType.CENTER })], shading: { fill: 'd9d9d9' }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }, width: { size: 17, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Institute/School', bold: true, size: 22 })], alignment: AlignmentType.CENTER })], shading: { fill: 'd9d9d9' }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }, width: { size: 56, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '% / CGPA', bold: true, size: 22 })], alignment: AlignmentType.CENTER })], shading: { fill: 'd9d9d9' }, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }, width: { size: 17, type: WidthType.PERCENTAGE } })
          ]
        })
      ]

      resumeData.education.forEach(edu => {
        eduRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: edu.year || '', size: 22 })], alignment: AlignmentType.CENTER })], borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: edu.qualification || '', size: 22 })] })], borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: edu.institute || '', size: 22 })] })], borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: edu.cgpa || '-', size: 22 })], alignment: AlignmentType.CENTER })], borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } } })
            ]
          })
        )
      })

      children.push(new Table({ rows: eduRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
    }

    
    if (resumeData.internships && resumeData.internships.length > 0) {
      const intRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'INTERNSHIP:', bold: true, color: 'FFFFFF', size: 22 })] })],
              columnSpan: 2,
              shading: { fill: '1f487c' },
              borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
            })
          ]
        })
      ]

      resumeData.internships.forEach(int => {
        const bullets = splitIntoBullets(int.description || '')
        const bulletParagraphs = bullets.map(bullet => 
          new Paragraph({ 
            children: parseBoldText(bullet),
            bullet: { level: 0 },
            spacing: { after: 40 }
          })
        )

        intRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: int.company || '', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: int.title || '', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
                  ...(int.period ? [new Paragraph({ children: [new TextRun({ text: `(${int.period})`, size: 22 })], alignment: AlignmentType.CENTER })] : [])
                ],
                width: { size: 29, type: WidthType.PERCENTAGE },
                shading: { fill: 'ececec' },
                verticalAlign: VerticalAlign.TOP,
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
              }),
              new TableCell({
                children: bulletParagraphs,
                width: { size: 71, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
              })
            ]
          })
        )
      })

      children.push(new Table({ rows: intRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
    }

    
    if (resumeData.positions && resumeData.positions.length > 0) {
      const posRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'POSITIONS OF RESPONSIBILITY:', bold: true, color: 'FFFFFF', size: 22 })] })],
              columnSpan: 2,
              shading: { fill: '1f487c' },
              borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
            })
          ]
        })
      ]

      resumeData.positions.forEach(pos => {
        const bullets = splitIntoBullets(pos.description || '')
        const bulletParagraphs = bullets.map(bullet => 
          new Paragraph({ 
            children: parseBoldText(bullet),
            bullet: { level: 0 },
            spacing: { after: 40 }
          })
        )

        posRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: pos.organization || '', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: pos.title || '', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
                  ...(pos.period ? [new Paragraph({ children: [new TextRun({ text: `(${pos.period})`, size: 22 })], alignment: AlignmentType.CENTER })] : [])
                ],
                width: { size: 29, type: WidthType.PERCENTAGE },
                shading: { fill: 'ececec' },
                verticalAlign: VerticalAlign.TOP,
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
              }),
              new TableCell({
                children: bulletParagraphs,
                width: { size: 71, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
              })
            ]
          })
        )
      })

      children.push(new Table({ rows: posRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
    }

    
    if (resumeData.extraCurriculars) {
      const bullets = splitIntoBullets(resumeData.extraCurriculars)
      const bulletParagraphs = bullets.map(bullet => 
        new Paragraph({ 
          children: parseBoldText(bullet),
          bullet: { level: 0 },
          spacing: { after: 80 }
        })
      )

      children.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'EXTRA-CURRICULARS ACHIEVEMENTS AND SKILLS:', bold: true, color: 'FFFFFF', size: 22 })] })],
                  shading: { fill: '1f487c' },
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: bulletParagraphs,
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
                })
              ]
            })
          ],
          width: { size: 100, type: WidthType.PERCENTAGE }
        })
      )
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
    }

    
    if (resumeData.academicAchievements) {
      const bullets = splitIntoBullets(resumeData.academicAchievements)
      const bulletParagraphs = bullets.map(bullet => 
        new Paragraph({ 
          children: parseBoldText(bullet),
          bullet: { level: 0 },
          spacing: { after: 80 }
        })
      )

      children.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'ACADEMIC ACHIEVEMENTS:', bold: true, color: 'FFFFFF', size: 22 })] })],
                  shading: { fill: '1f487c' },
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: bulletParagraphs,
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, left: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' }, right: { style: BorderStyle.SINGLE, size: 6, color: 'a6a6a6' } }
                })
              ]
            })
          ],
          width: { size: 100, type: WidthType.PERCENTAGE }
        })
      )
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }))
    }

    
    if (resumeData.skills) {
      const bullets = splitIntoBullets(resumeData.skills)
      const bulletParagraphs = bullets.map(bullet => 
        new Paragraph({ 
          children: parseBoldText(bullet),
          bullet: { level: 0 },
          spacing: { after: 80 }
        })
      )

      children.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'SKILLS:', bold: true, color: 'FFFFFF', size: 22 })] })],
                  shading: { fill: '0b5394' }, 
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, left: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, right: { style: BorderStyle.SINGLE, size: 6, color: '000000' } }
                })
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: bulletParagraphs,
                  borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, left: { style: BorderStyle.SINGLE, size: 6, color: '000000' }, right: { style: BorderStyle.SINGLE, size: 6, color: '000000' } }
                })
              ]
            })
          ],
          width: { size: 100, type: WidthType.PERCENTAGE }
        })
      )
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, 
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: children
      }]
    })

    const blob = await Packer.toBlob(doc)
    saveAs(blob, filename)
  } catch (error) {
    console.error('Error exporting to DOCX:', error)
    alert('Error exporting to DOCX. Please try again.')
  }
}
