import type { ItemCategory, Tone } from '../features/items/api/types'
import { calendarDaysBetween, addDays, pluralDays } from '../lib/dates'

/** A condensed port of the service's LetterTemplateEngine, so the demo previews realistic letters. */

export interface LetterContext {
  title: string
  counterparty: string
  category: ItemCategory
  amount: number | null
  currency: string | null
  expectedBy: Date
  createdOn: Date
  today: Date
  replyTo: string
}

interface Wording {
  situation: string
  rights: string
  demand: string
  consequence: string
}

const WORDING: Record<ItemCategory, Wording> = {
  REFUND: {
    situation:
      'I requested a refund{{amountPhrase}} in connection with "{{title}}". I expected to receive it by {{expectedBy}}; as of {{today}} it is {{overdueDays}} overdue and I have been waiting {{waitingDays}}.',
    rights:
      'Under consumer protection law (for example, in the UK the Consumer Rights Act 2015, and in the EU Directive 2011/83/EU on consumer rights), a consumer who is entitled to a refund must receive it without undue delay. I am entitled to a full refund to my original payment method.',
    demand: 'refund the full amount to my original payment method',
    consequence:
      'If I do not receive the refund by then I will dispute the charge with my card issuer or payment provider, report the matter to the relevant consumer protection authority, and consider a small-claims action.',
  },
  CLAIM: {
    situation:
      'I submitted a claim{{amountPhrase}} regarding "{{title}}". A decision or payment was expected by {{expectedBy}}; as of {{today}} that is {{overdueDays}} ago and I have been waiting {{waitingDays}}.',
    rights:
      'An insurer is required to handle claims promptly, fairly and reasonably and must not unreasonably delay or withhold payment of a valid claim (for example the UK Insurance Act 2015, s.13A, and the FCA ICOBS 8.1 claims-handling rules).',
    demand: 'give me a written decision on my claim and, where it is covered, pay it in full',
    consequence:
      'If I do not receive a decision and payment by then I will lodge a formal complaint and refer the matter to the competent ombudsman or regulator.',
  },
  REIMBURSEMENT: {
    situation:
      'I submitted an expense reimbursement{{amountPhrase}} for "{{title}}", due by {{expectedBy}}. As of {{today}} it is {{overdueDays}} overdue and I have been waiting {{waitingDays}}.',
    rights:
      'Business expenses properly incurred and submitted under the applicable expenses policy are owed to me under the terms of my agreement with you. Please treat this as a formal request under that policy.',
    demand: 'pay the outstanding reimbursement in full',
    consequence:
      'If it is not paid by then I will raise the matter with HR and finance leadership and take advice about the formal remedies available to me.',
  },
  APPROVAL: {
    situation:
      'I am waiting for a decision on "{{title}}"{{amountPhrase}}, which I expected by {{expectedBy}}. As of {{today}} it is {{overdueDays}} overdue and I have been waiting {{waitingDays}}.',
    rights:
      'Organisations and public bodies are expected to decide applications within any statutory or published service-standard time limit, and otherwise within a reasonable time, and to give reasons.',
    demand:
      'give me a written decision, or tell me precisely what is outstanding and the date by which a decision will be made',
    consequence:
      'If I do not receive a decision by then I will start your formal complaints or internal review procedure.',
  },
  DELIVERY: {
    situation:
      'I ordered "{{title}}"{{amountPhrase}} for delivery by {{expectedBy}}. As of {{today}} it is {{overdueDays}} late and I have been waiting {{waitingDays}}.',
    rights:
      'Under consumer protection law (for example the UK Consumer Rights Act 2015, s.28, and Article 18 of EU Directive 2011/83/EU) goods must be delivered within the agreed time. If they are not, I may set a final deadline and then treat the contract as ended and require a full refund.',
    demand: 'deliver my order, or confirm in writing that you will refund me in full',
    consequence:
      'If neither happens by then I will treat the contract as ended, claim a full refund through my card issuer or payment provider, and report the matter to the consumer protection authority.',
  },
  OTHER: {
    situation:
      'I have been waiting since {{createdOn}} for "{{title}}"{{amountPhrase}}, which I expected by {{expectedBy}}. As of {{today}} it is {{overdueDays}} overdue.',
    rights:
      'I am relying on the commitment you made to me and on my rights under the agreement between us and under applicable law, including the duty to perform obligations within a reasonable time.',
    demand: 'do what you committed to, or confirm in writing exactly when I will receive it',
    consequence:
      'If I do not hear from you by then I will use the complaint, regulatory and legal routes available to me.',
  },
}

const longDate = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)}}/g, (_, name: string) => vars[name] ?? '')
}

function variables(c: LetterContext): Record<string, string> {
  const amountPhrase =
    c.amount === null ? '' : ` of ${c.currency ? `${c.currency} ` : ''}${String(c.amount)}`
  return {
    title: c.title,
    counterparty: c.counterparty,
    expectedBy: longDate(c.expectedBy),
    createdOn: longDate(c.createdOn),
    today: longDate(c.today),
    overdueDays: pluralDays(Math.max(0, calendarDaysBetween(c.expectedBy, c.today))),
    waitingDays: pluralDays(Math.max(0, calendarDaysBetween(c.createdOn, c.today))),
    amountPhrase,
    senderName: '[Your name]',
    replyTo: c.replyTo,
  }
}

export function draftLetter(tone: Tone, c: LetterContext): { subject: string; body: string } {
  const v = variables(c)
  if (tone === 'NUDGE') {
    return {
      subject: render('Following up: {{title}}', v),
      body: render(
        [
          'Hello {{counterparty}},',
          '',
          'I am following up on "{{title}}"{{amountPhrase}}. I was expecting this by {{expectedBy}} and it is now {{overdueDays}} past that date.',
          '',
          'Could you please let me know the current status and when I can expect it to be completed? If you need anything further from me, just reply to this message and I will send it right away.',
          '',
          'Many thanks,',
          '{{senderName}}',
          'Reply to: {{replyTo}}',
          '',
        ].join('\n'),
        v,
      ),
    }
  }
  const final = tone === 'FINAL_NOTICE'
  const deadlineDays = final ? 7 : 14
  const wording = WORDING[c.category]
  const w: Record<string, string> = {
    ...v,
    deadlineDays: String(deadlineDays),
    deadlineDate: longDate(addDays(c.today, deadlineDays)),
  }
  const parts = {
    situation: render(wording.situation, w),
    rights: render(wording.rights, w),
    demand: render(wording.demand, w),
    consequence: render(wording.consequence, w),
    heading: final ? 'FINAL NOTICE' : 'FORMAL COMPLAINT AND REQUEST FOR ACTION',
    opening: final
      ? 'I wrote to you previously and have not received what I am owed. This is my final notice before I take further action.'
      : 'I am writing to formally escalate an unresolved matter. My earlier reminder did not produce a resolution.',
  }
  const body = render(
    [
      '{{heading}}',
      '',
      'Dear {{counterparty}},',
      '',
      'Re: {{title}}',
      '',
      '{{opening}}',
      '',
      '{{situation}}',
      '',
      '{{rights}}',
      '',
      'I therefore ask you to {{demand}} within {{deadlineDays}} days of the date of this letter, that is by {{deadlineDate}}. {{consequence}}',
      '',
      'Please send your reply to {{replyTo}} and keep a written record of any further communication.',
      '',
      'Yours faithfully,',
      '{{senderName}}',
      '',
    ].join('\n'),
    { ...w, ...parts },
  )
  return { subject: `${final ? 'FINAL NOTICE: ' : 'Formal complaint: '}${c.title}`, body }
}
