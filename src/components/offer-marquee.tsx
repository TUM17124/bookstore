const OFFERS = [
  "Agribusiness loan plans",
  "County tender & RFQ templates",
  "KRA tax & SME bookkeeping",
  "NGO / CBO proposal frameworks",
  "Hospitality SOPs & recipe costing",
  "Chama constitutions",
  "Kenyan lease & tenancy forms",
  "Employment contracts",
  "ATS CVs & cover letters",
  "PSC interview prep",
  "NGO & UN application packs",
  "Remote work guides",
  "LinkedIn optimization",
  "TSC promotion notes",
  "KASNEB / EBK / Cisco blueprints",
  "CBC assessment notes",
  "KCSE revision packs",
  "Nursing attachment logbooks",
  "KSL revision outlines",
  "Set-book guides",
  "CPA summaries",
  "Land-buying due diligence",
  "Ardhisasa manuals",
  "Budget & debt planners",
  "Importation blueprints",
  "Nairobi side-hustle planners",
  "Kenyan meal plans",
  "Wedding & ruracio budgets",
  "Apartment layout plans",
  "Poultry health charts",
  "Wellness workbooks",
  "Phonics worksheets",
  "Car maintenance logs",
]

export function OfferMarquee() {
  const line = OFFERS.join("  ·  ")

  return (
    <div
      className="relative overflow-hidden border-b border-foreground/10 bg-foreground/[0.04]"
      aria-label="What PlugYard offers"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee-left py-2.5">
        {[0, 1].map((i) => (
          <p
            key={i}
            className="shrink-0 px-6 text-[13px] font-semibold tracking-wide text-foreground/80 whitespace-nowrap"
          >
            <span className="mr-3 font-bold text-foreground">PlugYard library</span>
            {line}
            <span className="mx-8 text-foreground/25">·</span>
          </p>
        ))}
      </div>
    </div>
  )
}