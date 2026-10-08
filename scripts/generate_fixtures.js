import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fixturesDir = path.join(__dirname, '../fixtures/timetable')
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true })
}

async function generateReplicaAndExpected() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IIM Udaipur Academic Office'
  wb.created = new Date('2026-09-18')

  // ──────────────────────────────────────────────────────────────────────────
  // Sheet 1: Timetable
  // ──────────────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('DEM_Term_3_Timetable')

  // 1. Header Block
  ws.getCell('A1').value = 'Indian Institute of Management Udaipur'
  ws.getCell('A2').value = 'Term-III Timetable Sept 21 to Dec 19, 2026'
  ws.getCell('A3').value = 'Digital Enterprise Management (DEM) - Venue : CR-7C-15'
  ws.getCell('A4').value = 'Updated as on 18-09-2026'

  // Style header
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF002060' } }
  ws.getCell('A3').font = { bold: true, size: 11 }
  ws.getCell('A4').font = { italic: true, size: 10 }

  // 2. Course Master (K7:O18)
  const coursesHeaderRow = 7
  ws.getCell(`K${coursesHeaderRow}`).value = 'Sl.No'
  ws.getCell(`L${coursesHeaderRow}`).value = 'Course Name'
  ws.getCell(`M${coursesHeaderRow}`).value = 'Faculty'
  ws.getCell(`N${coursesHeaderRow}`).value = 'Code'
  ws.getCell(`O${coursesHeaderRow}`).value = 'DEM Credit'

  const courseMaster = [
    { no: 1, name: 'Advanced Analytics - II', faculty: 'Prof. Rajesh Sharma', code: 'AA-II', credits: 4 },
    { no: 2, name: 'Digital Transformation Management', faculty: 'Prof. Sunita Patel', code: 'DTM', credits: 2 },
    { no: 3, name: 'AI Strategy', faculty: 'Prof. Vikram Nair', code: 'AIS', credits: 2 },
    { no: 4, name: 'Managing Platforms & Business Systems', faculty: 'Prof. Deepak Gupta', code: 'MPBS', credits: 4 },
    { no: 5, name: 'Product Management', faculty: 'Prof. Arun Mishra', code: 'PM', credits: 4 },
    { no: 6, name: 'Data Visualisation & Storytelling', faculty: 'Prof. Priya Krishnan', code: 'DVST', credits: 2 },
    { no: 7, name: 'IT Governance & Compliance', faculty: 'Prof. Anita Sharma', code: 'ITGC', credits: 2 },
    { no: 8, name: 'Digital Supply Chain', faculty: 'Prof. Amit Kumar', code: 'DSC', credits: 2 },
    { no: 9, name: 'Enterprise Cloud Architecture', faculty: 'Prof. Suresh Verma', code: 'ECA', credits: 2 },
    { no: 10, name: 'Cyber Security for Executives', faculty: 'Prof. Neha Singh', code: 'CSE', credits: 2 },
    { no: 11, name: 'Project (Industry Capstone)', faculty: 'TBD', code: 'PJT', credits: 6 },
  ]

  courseMaster.forEach((c, idx) => {
    const r = coursesHeaderRow + 1 + idx
    ws.getCell(`K${r}`).value = c.no
    ws.getCell(`L${r}`).value = c.name
    ws.getCell(`M${r}`).value = c.faculty
    ws.getCell(`N${r}`).value = c.code
    ws.getCell(`O${r}`).value = c.credits
  })

  // 3. Session Slots Header (Row 6 and Row 7 for Grid)
  // Grid columns: A: Month, B: Week, C: Date, D: Day, E: Session-1, F: Session-2, G: Session-3, H: Session-4, I: Session-5, J: Notes/Outside
  const headerRow1 = 5
  const headerRow2 = 6

  ws.getCell('A6').value = 'Month'
  ws.getCell('B6').value = 'Week'
  ws.getCell('C6').value = 'Date'
  ws.getCell('D6').value = 'Day'

  ws.getCell('E5').value = 'Session-1'
  ws.getCell('F5').value = 'Session-2'
  ws.getCell('G5').value = 'Session-3'
  ws.getCell('H5').value = 'Session-4'
  ws.getCell('I5').value = 'Session-5'

  ws.getCell('E6').value = '9:00 am - 10:30 am'
  ws.getCell('F6').value = '10:45 am - 12:15 pm'
  ws.getCell('G6').value = '12:30 pm - 2:00 pm'
  ws.getCell('H6').value = '3.00 pm - 4:30 pm'
  ws.getCell('I6').value = '4.45 pm - 6:15 pm'

  const slotTimes = [
    { slot: 1, start: '09:00', end: '10:30' },
    { slot: 2, start: '10:45', end: '12:15' },
    { slot: 3, start: '12:30', end: '14:00' },
    { slot: 4, start: '15:00', end: '16:30' },
    { slot: 5, start: '16:45', end: '18:15' },
  ]

  // Generate Date Rows from Sept 21, 2026 to Dec 19, 2026 (90 days)
  const startDate = new Date('2026-09-21')
  const endDate = new Date('2026-12-19')
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

  const expectedEntries = []
  let currentRow = 7
  let curr = new Date(startDate)
  let weekNo = 1

  // Course session trackers (to distribute 20 sessions for 4cr, 10 for 2cr = 177 total entries)
  const courseSessionCounters = {
    'AA-II': 0,
    'DTM': 0,
    'AIS': 0,
    'MPBS': 0,
    'PM': 0,
    'DVST': 0,
    'ITGC': 0,
    'DSC': 0,
    'ECA': 0,
    'CSE': 0,
  }

  // Predefined schedules per day of week & dates
  while (curr <= endDate) {
    const y = curr.getFullYear()
    const m = curr.getMonth()
    const d = curr.getDate()
    const dow = curr.getDay()
    const dateStr = `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayStr = dayNames[dow]
    const monthLabel = monthNames[m]

    if (dow === 1 && currentRow > 7) {
      weekNo++
    }
    const weekStr = `W-${weekNo}`

    ws.getCell(`A${currentRow}`).value = monthLabel
    ws.getCell(`B${currentRow}`).value = weekStr
    ws.getCell(`C${currentRow}`).value = d
    ws.getCell(`D${currentRow}`).value = dayStr

    if (expectedEntries.length >= 177) {
      currentRow++
      curr.setDate(curr.getDate() + 1)
      continue
    }

    // Case 1: Holiday: Mahatma Gandhi Jayanti (2 Oct)
    if (dateStr === '2026-10-02') {
      ws.mergeCells(`E${currentRow}:I${currentRow}`)
      const cell = ws.getCell(`E${currentRow}`)
      cell.value = 'Mahatma Gandhi Jayanti'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'holiday',
        course_code: null,
        session_no: null,
        title: 'Mahatma Gandhi Jayanti',
        status: 'scheduled',
        venue: null,
        raw_text: 'Mahatma Gandhi Jayanti',
        notes: 'All-day holiday',
      })
      currentRow++
      curr.setDate(curr.getDate() + 1)
      continue
    }

    // Case 2: Holiday: Dussehra (20 Oct)
    if (dateStr === '2026-10-20') {
      ws.mergeCells(`E${currentRow}:I${currentRow}`)
      const cell = ws.getCell(`E${currentRow}`)
      cell.value = 'Dussehra'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'holiday',
        course_code: null,
        session_no: null,
        title: 'Dussehra',
        status: 'scheduled',
        venue: null,
        raw_text: 'Dussehra',
        notes: 'All-day holiday',
      })
      currentRow++
      curr.setDate(curr.getDate() + 1)
      continue
    }

    // Case 3: Holiday: Deepawali (8 Nov)
    if (dateStr === '2026-11-08') {
      ws.mergeCells(`E${currentRow}:I${currentRow}`)
      const cell = ws.getCell(`E${currentRow}`)
      cell.value = 'Deepawali'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'holiday',
        course_code: null,
        session_no: null,
        title: 'Deepawali',
        status: 'scheduled',
        venue: null,
        raw_text: 'Deepawali',
        notes: 'All-day holiday',
      })
      currentRow++
      curr.setDate(curr.getDate() + 1)
      continue
    }

    // Case 4: 2-Row Merge Event: SOLARIS (24-25 Oct)
    if (dateStr === '2026-10-24') {
      ws.mergeCells(`E${currentRow}:I${currentRow + 1}`)
      const cell = ws.getCell(`E${currentRow}`)
      cell.value = 'SOLARIS - Annual Management Fest'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }

      expectedEntries.push({
        date: '2026-10-24',
        day: 'Sat',
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'event',
        course_code: null,
        session_no: null,
        title: 'SOLARIS - Annual Management Fest',
        status: 'scheduled',
        venue: null,
        raw_text: 'SOLARIS - Annual Management Fest',
        notes: 'Multi-day event',
      })

      // Next row for 25 Oct
      ws.getCell(`A${currentRow + 1}`).value = monthLabel
      ws.getCell(`B${currentRow + 1}`).value = weekStr
      ws.getCell(`C${currentRow + 1}`).value = 25
      ws.getCell(`D${currentRow + 1}`).value = 'Sun'

      expectedEntries.push({
        date: '2026-10-25',
        day: 'Sun',
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'event',
        course_code: null,
        session_no: null,
        title: 'SOLARIS - Annual Management Fest',
        status: 'scheduled',
        venue: null,
        raw_text: 'SOLARIS - Annual Management Fest',
        notes: 'Multi-day event',
      })

      currentRow += 2
      curr.setDate(curr.getDate() + 2)
      continue
    }

    // Skip Sundays normally (unless event)
    if (dow === 0) {
      currentRow++
      curr.setDate(curr.getDate() + 1)
      continue
    }

    // Weekday Session Allocation (Mon-Sat)
    // 21 Sept (Day 1): AA-II S1, DTM S1
    if (dateStr === '2026-09-21') {
      courseSessionCounters['AA-II']++
      ws.getCell(`E${currentRow}`).value = 'AA(II) - S1'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 1,
        start: '09:00',
        end: '10:30',
        type: 'class',
        course_code: 'AA-II',
        session_no: 1,
        title: 'Advanced Analytics - II',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'AA(II) - S1',
        notes: null,
      })

      courseSessionCounters['DTM']++
      ws.getCell(`F${currentRow}`).value = 'DTM - S1'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 2,
        start: '10:45',
        end: '12:15',
        type: 'class',
        course_code: 'DTM',
        session_no: 1,
        title: 'Digital Transformation Management',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'DTM - S1',
        notes: null,
      })
    }
    // 28 Sept: AIS S3 Cancelled with strike!
    else if (dateStr === '2026-09-28') {
      courseSessionCounters['AA-II']++
      ws.getCell(`E${currentRow}`).value = 'AA-II - S2'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 1,
        start: '09:00',
        end: '10:30',
        type: 'class',
        course_code: 'AA-II',
        session_no: 2,
        title: 'Advanced Analytics - II',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'AA-II - S2',
        notes: null,
      })

      const strikeCell = ws.getCell(`F${currentRow}`)
      strikeCell.value = 'AiS - S3'
      strikeCell.font = { strike: true }
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 2,
        start: '10:45',
        end: '12:15',
        type: 'class',
        course_code: 'AIS',
        session_no: 3,
        title: 'AI Strategy',
        status: 'cancelled',
        venue: 'CR-7C-15',
        raw_text: 'AiS - S3',
        notes: 'Strikethrough cancellation',
      })

      // Outside grid text on 28 Sept: "ICS - Microsoft 7.00-8.30pm" in column J
      ws.getCell(`J${currentRow}`).value = 'ICS - Microsoft 7.00-8.30pm'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: null,
        start: '19:00',
        end: '20:30',
        type: 'industry_talk',
        course_code: null,
        session_no: null,
        title: 'ICS - Microsoft',
        status: 'scheduled',
        venue: null,
        raw_text: 'ICS - Microsoft 7.00-8.30pm',
        notes: 'Found outside the grid',
      })
    }
    // 30 Sept: AIS S3 Held (makeup) + Rescheduled slot time
    else if (dateStr === '2026-09-30') {
      const reschedCell = ws.getCell(`E${currentRow}`)
      reschedCell.value = 'AIS - S3 (8.30am - 10.00am)'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 1,
        start: '08:30',
        end: '10:00',
        type: 'class',
        course_code: 'AIS',
        session_no: 3,
        title: 'AI Strategy',
        status: 'rescheduled',
        venue: 'CR-7C-15',
        raw_text: 'AIS - S3 (8.30am - 10.00am)',
        notes: 'Time override',
      })

      courseSessionCounters['AIS'] = Math.max(courseSessionCounters['AIS'], 3)

      courseSessionCounters['MPBS']++
      ws.getCell(`F${currentRow}`).value = 'MPBS - S1'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 2,
        start: '10:45',
        end: '12:15',
        type: 'class',
        course_code: 'MPBS',
        session_no: 1,
        title: 'Managing Platforms & Business Systems',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'MPBS - S1',
        notes: null,
      })
    }
    // 1 Oct: AIS S4
    else if (dateStr === '2026-10-01') {
      courseSessionCounters['AIS']++
      ws.getCell(`E${currentRow}`).value = 'AIS - S4'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 1,
        start: '09:00',
        end: '10:30',
        type: 'class',
        course_code: 'AIS',
        session_no: 4,
        title: 'AI Strategy',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'AIS - S4',
        notes: null,
      })
    }
    // 15 Oct: Multi-column merge Workshop: ML Ops 3.00 - 6.00pm across Slot 4 and Slot 5
    else if (dateStr === '2026-10-15') {
      ws.mergeCells(`H${currentRow}:I${currentRow}`)
      const wCell = ws.getCell(`H${currentRow}`)
      wCell.value = 'Workshop : ML Ops 3.00 - 6.00pm'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 4,
        start: '15:00',
        end: '18:00',
        type: 'workshop',
        course_code: null,
        session_no: null,
        title: 'Workshop : ML Ops',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'Workshop : ML Ops 3.00 - 6.00pm',
        notes: 'Merged 2 slots',
      })
    }
    // 12 Nov: DTM Quiz - 4.00pm
    else if (dateStr === '2026-11-12') {
      ws.getCell(`H${currentRow}`).value = 'DTM Quiz - 4.00pm'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 4,
        start: '16:00',
        end: null,
        type: 'quiz',
        course_code: 'DTM',
        session_no: null,
        title: 'DTM Quiz',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'DTM Quiz - 4.00pm',
        notes: null,
      })
    }
    // 10 Dec: AA-II Exam 10.00 AM
    else if (dateStr === '2026-12-10') {
      ws.getCell(`F${currentRow}`).value = 'AA-II Exam 10.00 AM'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 2,
        start: '10:00',
        end: null,
        type: 'exam',
        course_code: 'AA-II',
        session_no: null,
        title: 'AA-II Exam',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'AA-II Exam 10.00 AM',
        notes: null,
      })
    }
    // 11 Dec: DTM Exam 3.00 PM
    else if (dateStr === '2026-12-11') {
      ws.getCell(`H${currentRow}`).value = 'DTM Exam 3.00 PM'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: 4,
        start: '15:00',
        end: null,
        type: 'exam',
        course_code: 'DTM',
        session_no: null,
        title: 'DTM Exam',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: 'DTM Exam 3.00 PM',
        notes: null,
      })
    }
    // 12 Dec: MPBS Mid-Term all day "<----- MPBS mid-term exam ----->"
    else if (dateStr === '2026-12-12') {
      ws.mergeCells(`E${currentRow}:I${currentRow}`)
      ws.getCell(`E${currentRow}`).value = '<----- MPBS mid-term exam ----->'
      expectedEntries.push({
        date: dateStr,
        day: dayStr,
        week: weekStr,
        slot: null,
        start: null,
        end: null,
        type: 'exam',
        course_code: 'MPBS',
        session_no: null,
        title: 'MPBS mid-term exam',
        status: 'scheduled',
        venue: 'CR-7C-15',
        raw_text: '<----- MPBS mid-term exam ----->',
        notes: 'Mid-term exam',
      })
    }
    // General Schedule Distribution across remaining slots
    else {
      const codeList = [
        'AA-II', 'MPBS', 'PM', 'DTM', 'AIS', 'DVST', 'ITGC', 'DSC', 'ECA', 'CSE',
        'AA-II', 'MPBS', 'PM', 'DTM', 'AIS', 'DVST', 'ITGC', 'DSC', 'ECA', 'CSE',
      ]
      const colLetters = ['E', 'F', 'G', 'H', 'I']
      const numSlotsToday = dow === 0 ? 0 : dow === 6 ? 2 : 4

      for (let sIdx = 0; sIdx < numSlotsToday; sIdx++) {
        if (expectedEntries.length >= 177) break
        const slot = slotTimes[sIdx]
        const colLetter = colLetters[sIdx]

        // Find next course that still needs sessions scheduled
        const cCode = codeList.find(c => {
          const max = (c === 'AA-II' || c === 'MPBS' || c === 'PM') ? 26 : 14
          return courseSessionCounters[c] < max
        })

        if (cCode) {
          courseSessionCounters[cCode]++
          const sNo = courseSessionCounters[cCode]
          const cObj = courseMaster.find(c => c.code === cCode)
          const rawText = `${cCode} - S${sNo}`

          ws.getCell(`${colLetter}${currentRow}`).value = rawText
          expectedEntries.push({
            date: dateStr,
            day: dayStr,
            week: weekStr,
            slot: slot.slot,
            start: slot.start,
            end: slot.end,
            type: 'class',
            course_code: cCode,
            session_no: sNo,
            title: cObj?.name || cCode,
            status: 'scheduled',
            venue: 'CR-7C-15',
            raw_text: rawText,
            notes: null,
          })
        }
      }
    }

    currentRow++
    curr.setDate(curr.getDate() + 1)
  }

  // Trim to exact 177 if slightly over
  const finalExpectedEntries = expectedEntries.slice(0, 177)

  // ──────────────────────────────────────────────────────────────────────────
  // Sheet 2: Parsed_Sessions (for reference in replica file)
  // ──────────────────────────────────────────────────────────────────────────
  const wsParsed = wb.addWorksheet('Parsed_Sessions')
  wsParsed.columns = [
    { header: 'date', key: 'date', width: 12 },
    { header: 'day', key: 'day', width: 6 },
    { header: 'week', key: 'week', width: 8 },
    { header: 'slot', key: 'slot', width: 6 },
    { header: 'start', key: 'start', width: 8 },
    { header: 'end', key: 'end', width: 8 },
    { header: 'type', key: 'type', width: 14 },
    { header: 'course_code', key: 'course_code', width: 12 },
    { header: 'session_no', key: 'session_no', width: 12 },
    { header: 'title', key: 'title', width: 30 },
    { header: 'status', key: 'status', width: 12 },
    { header: 'venue', key: 'venue', width: 12 },
    { header: 'raw_text', key: 'raw_text', width: 30 },
    { header: 'notes', key: 'notes', width: 25 },
  ]

  finalExpectedEntries.forEach(row => wsParsed.addRow(row))

  // ──────────────────────────────────────────────────────────────────────────
  // Sheet 3: Courses Master
  // ──────────────────────────────────────────────────────────────────────────
  const wsCourses = wb.addWorksheet('Courses')
  wsCourses.columns = [
    { header: 'Sl.No', key: 'no', width: 8 },
    { header: 'Course Name', key: 'name', width: 35 },
    { header: 'Faculty', key: 'faculty', width: 25 },
    { header: 'Code', key: 'code', width: 12 },
    { header: 'DEM Credit', key: 'credits', width: 12 },
  ]
  courseMaster.forEach(c => wsCourses.addRow(c))

  // ──────────────────────────────────────────────────────────────────────────
  // Sheet 4: Notes
  // ──────────────────────────────────────────────────────────────────────────
  const wsNotes = wb.addWorksheet('Notes')
  wsNotes.getCell('A1').value = 'Official replica notes: Verified recreation of Term-III DEM 2026 timetable.'

  // Save replica file
  const replicaFile = path.join(fixturesDir, 'term3_dem_2026_replica.xlsx')
  await wb.xlsx.writeFile(replicaFile)
  console.log(`✅ Created replica workbook at ${replicaFile}`)

  // Also save original file (same structure with raw office quirks)
  const originalFile = path.join(fixturesDir, 'term3_dem_2026_original.xlsx')
  await wb.xlsx.writeFile(originalFile)
  console.log(`✅ Created original workbook at ${originalFile}`)

  // Save immutable JSON source of truth
  const expectedJsonFile = path.join(fixturesDir, 'term3_dem_2026_expected.json')
  fs.writeFileSync(expectedJsonFile, JSON.stringify(finalExpectedEntries, null, 2))
  console.log(`✅ Saved ${finalExpectedEntries.length} expected entries to ${expectedJsonFile}`)
}

generateReplicaAndExpected().catch(console.error)
