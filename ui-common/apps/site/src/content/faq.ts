export interface FaqItem {
  question: string
  answer: string
}

export const faq: readonly FaqItem[] = [
  {
    question: 'What is My-Trove?',
    answer:
      'Six small products for the paperwork of life: chasing what you are owed, lending your details to apps, watching appliances, searching your own notes, planning what you leave behind and keeping household books. They share one sign-in and one platform, so you set up a person once and use whichever products you need.',
  },
  {
    question: 'Can I try it without signing in?',
    answer:
      'Yes. The live demo opens the workspace in demo mode: a stand-in sign-in and sample data that lives in your browser. It makes no calls to a backend, so nothing you do there is stored anywhere.',
  },
  {
    question: 'Is there a hosted version?',
    answer:
      'Not yet. My-Trove is a portfolio build that runs on your own machine against real local services. There is no production deployment. The Docs page has the commands to start it.',
  },
  {
    question: 'Does it email or text anyone?',
    answer:
      'No. Notification delivery is log-only today. Waiting On drafts a letter for you to send, and Digital Legacy writes its reminders to a log.',
  },
  {
    question: 'Does it cost anything?',
    answer:
      'No. There are three plans that set request limits, and billing is simulated. There are no prices and no payments, and Family Treasury moves no money either.',
  },
  {
    question: 'Can the server read my legacy vault?',
    answer:
      'Not the contents. They are encrypted in your browser and the key is split among your trustees. The server can delay or withhold a release, and a hostile one could try to swap a trustee’s key, which is why you compare key fingerprints by hand.',
  },
  {
    question: 'Has it been security audited?',
    answer:
      'No. It has an extensive test suite and several deliberate protections, listed on the security page, but no outside review.',
  },
  {
    question: 'Can developers build on it?',
    answer:
      'In part. An app can already ask for scoped, revocable access to a person’s data through Consent. API keys, webhooks, the API reference and an SDK arrive with the developer portal, which is not built yet.',
  },
]
