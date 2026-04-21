const PartnerApplication = require('./Model')
const { Parser } = require('json2csv')

// ── Helper: generate reference number ──────────────────────────────────────
function generateRef() {
  const year = new Date().getFullYear()
  const rand = Math.floor(Math.random() * 90000) + 10000
  return `ENQ-${year}-${rand}`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/partner-applications
// Submit a new partner application and persist it to MongoDB.
// ─────────────────────────────────────────────────────────────────────────────
const submitApplication = async (req, res) => {
  try {
    const formData = req.body

    // Basic guard: at minimum a trading name or organiser name must be present
    if (!formData.tradingName && !formData.organiserName && !formData.companyLegalName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required business identifier (tradingName / organiserName / companyLegalName)',
      })
    }

    const ref = generateRef()

    const application = new PartnerApplication({
      ...formData,
      referenceNumber: ref,
      submittedAt: new Date(),
      // Ensure arrays are always arrays (protect against string values sent accidentally)
      selectedSubcats:  Array.isArray(formData.selectedSubcats)  ? formData.selectedSubcats  : [],
      visitDays:        Array.isArray(formData.visitDays)        ? formData.visitDays        : [],
      visitTimes:       Array.isArray(formData.visitTimes)       ? formData.visitTimes       : [],
      offerings:        Array.isArray(formData.offerings)        ? formData.offerings        : [],
      timeRestrictions: Array.isArray(formData.timeRestrictions) ? formData.timeRestrictions : [],
      qrAdditionalLocs: Array.isArray(formData.qrAdditionalLocs) ? formData.qrAdditionalLocs : [],
      eventOfferTypes:  Array.isArray(formData.eventOfferTypes)  ? formData.eventOfferTypes  : [],
    })

    await application.save()

    return res.status(201).json({
      success: true,
      message: 'Partner application submitted successfully.',
      ref,
      id: application._id,
    })
  } catch (err) {
    console.error('submitApplication error:', err)

    // Duplicate reference — extremely unlikely but handle gracefully
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate reference number. Please try submitting again.',
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/partner-applications
// Return all applications as JSON (for admin dashboard use).
// ─────────────────────────────────────────────────────────────────────────────
const getAllApplications = async (req, res) => {
  try {
    const applications = await PartnerApplication.find()
      .sort({ submittedAt: -1 })
      .lean()

    return res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    })
  } catch (err) {
    console.error('getAllApplications error:', err)
    return res.status(500).json({ success: false, message: 'Server error.' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/partner-applications/download/csv
// Stream all applications as a downloadable CSV file.
// ─────────────────────────────────────────────────────────────────────────────
const downloadCSV = async (req, res) => {
  try {
    const applications = await PartnerApplication.find()
      .sort({ submittedAt: -1 })
      .lean()

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No applications found to export.',
      })
    }

    // Flatten arrays into semicolon-separated strings for CSV readability
    const flattened = applications.map(app => ({
      ...app,
      _id:              app._id?.toString(),
      selectedSubcats:  (app.selectedSubcats  || []).join('; '),
      visitDays:        (app.visitDays        || []).join('; '),
      visitTimes:       (app.visitTimes       || []).join('; '),
      offerings:        (app.offerings        || []).join('; '),
      timeRestrictions: (app.timeRestrictions || []).join('; '),
      qrAdditionalLocs: (app.qrAdditionalLocs || []).join('; '),
      eventOfferTypes:  (app.eventOfferTypes  || []).join('; '),
      submittedAt:      app.submittedAt
        ? new Date(app.submittedAt).toISOString()
        : '',
      createdAt: app.createdAt ? new Date(app.createdAt).toISOString() : '',
      updatedAt: app.updatedAt ? new Date(app.updatedAt).toISOString() : '',
    }))

    // Build ordered fields list for the CSV header
    const fields = [
      'referenceNumber','submittedAt','selectedCategoryCode','selectedCategoryName',
      'selectedSubcats','tradingName','legalName','regNumber','yearEstablished',
      'repFullName','repJobTitle','repEmail','repPhone','commLanguage',
      // Physical
      'streetAddress','postcode','city','district','googleMapsUrl','numLocations',
      'cuisineSpecialty','seatingCapacity','avgSpend','businessDescription',
      'monFriStart','monFriEnd','monFriClosed','satStart','satEnd','satClosed',
      'sunStart','sunEnd','sunClosed','hasStudentOffer','studentOfferDetails',
      'otherPlatforms','businessWebsite','instagramHandle','tiktokHandle','otherSocial',
      'photoRequest','marketingContact','marketingPhone','visitDays','visitTimes',
      'offerings','contentBudget',
      // Events
      'organiserName','eventCity','typicalVenues','eventCapacity','eventFrequency',
      'eventDescription','eventWebsite','eventInstagram','eventTiktok','ticketPlatform',
      // Online
      'serviceUrl','companyLegalName','registeredCountry','serviceDescription',
      'serviceCoverage','serviceLanguages','onlineStudentPricing','competitorPlatforms',
      'complianceNotes',
      // Benefit (physical)
      'benefitType','benefitDescription','baselinePrice','benefitValue','conditions',
      'timeRestrictions','qrConfirmed','qrAdditionalLocs',
      // Benefit (events)
      'eventOfferTypes','eventOfferDesc','standardDoorPrice','memberPrice',
      'eventConditions','qrEventsConfirmed',
      // Benefit (online)
      'promoCode','promoCodeValidity','promoOnlineBenefit','promoPublicPrice',
      'promoMemberPrice','promoConditions',
      // Tier
      'selectedTier','addonBoost','addonPush','addonEvent','addonSocial',
      'startDate','partnershipTerm',
      // Signature
      'decl1','decl2','decl3','decl4','decl5','decl6','finalAgree',
      'sigFullName','sigJobTitle','sigDate',
      '_id','createdAt','updatedAt',
    ]

    const parser = new Parser({ fields })
    const csv = parser.parse(flattened)

    const filename = `partner-applications-${new Date().toISOString().slice(0, 10)}.csv`

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.status(200).send(csv)
  } catch (err) {
    console.error('downloadCSV error:', err)
    return res.status(500).json({ success: false, message: 'CSV export failed.' })
  }
}

module.exports = { submitApplication, getAllApplications, downloadCSV }