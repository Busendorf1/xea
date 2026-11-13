import type { FlowNode } from './flowTypes';

export const promoterFlowNodes: Record<string, FlowNode> = {
  // ==========================================
  // TRACK B: PROMOTER TRACK ("PROMOTE MY BUSINESS")
  // ==========================================

  // P1. Why should a business advertise on Paayh?
  promoter_p1: {
    id: 'promoter_p1',
    aiMessage:
      'Paayh connects you with verified active community members. Viewing is voluntary and for discovery, with viewers receiving a share of the promotional budget for verified attention. Because they earn rewards, they also have real spending power to patronize offers that resonate.',
    referralLink: {
      label: 'Read Advertiser Guidelines',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_p1_next',
        text: 'Will my campaign convert?',
        nextNodeId: 'promoter_p2',
      },
      {
        id: 'c_p1_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p1_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P2. Will my campaign convert?
  promoter_p2: {
    id: 'promoter_p2',
    aiMessage:
      'We place your content directly before the listeners you targeted with 16 seconds of undivided focus. Conversion depends on your creative and the appeal of your offer, so craft your message wisely.',
    referralLink: {
      label: 'Read Creative Best Practices in Guidelines',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_p2_next',
        text: 'If listeners earn money, will they really pay attention?',
        nextNodeId: 'promoter_p3_attention',
      },
      {
        id: 'c_p2_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p2_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P3. The Attention & Active Intent Question (Research-backed)
  promoter_p3_attention: {
    id: 'promoter_p3_attention',
    aiMessage:
      'Research shows people ignore content when it interrupts them, but pay attention when participation is voluntary. Because listeners choose their own interests, they are already curious. A clear offer in your first seconds hooks them immediately.',
    referralLink: {
      label: 'Read Creative Guidelines and Attention Insights',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_p3_next',
        text: 'Can listeners who earn here afford to buy my products?',
        nextNodeId: 'promoter_p4_afford',
      },
      {
        id: 'c_p3_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p3_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P4. Purchasing Power Question (Research-backed)
  promoter_p4_afford: {
    id: 'promoter_p4_afford',
    aiMessage:
      'Yes. Our listeners are everyday consumers, workers, and students with real purchasing needs. As they accumulate wallet earnings on Paayh, they gain extra spending power to patronize products and services that catch their interest.',
    referralLink: {
      label: 'Read Audience Insights and FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_p4_next',
        text: 'How does rewarding attention improve my actual sales conversion?',
        nextNodeId: 'promoter_p5_roi',
      },
      {
        id: 'c_p4_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p4_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P5. Rewarded Attention vs Traditional Ads ROI (Research-backed)
  promoter_p5_roi: {
    id: 'promoter_p5_roi',
    aiMessage:
      'Traditional platforms charge you for half second skipped views that create frustration. Rewarding attention creates goodwill and 16 seconds of calm consideration. When paired with direct WhatsApp chat or CTAs, inquiries turn into closed sales.',
    referralLink: {
      label: 'Read About Our Mutual Value Model',
      url: '/about',
    },
    choices: [
      {
        id: 'c_p5_next',
        text: 'Is Paayh 100% bot free?',
        nextNodeId: 'promoter_p6_bot',
      },
      {
        id: 'c_p5_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p5_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P6. Is Paayh 100% bot free?
  promoter_p6_bot: {
    id: 'promoter_p6_bot',
    aiMessage:
      'We are deeply committed to keeping the platform bot free. While no online technology can claim absolute perfection, our multi layer engineering actively drives invalid traffic to the barest minimum.',
    referralLink: {
      label: 'Read Anti Fraud and Quality Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_p6_next',
        text: 'Why location by GPS?',
        nextNodeId: 'promoter_p7_gps',
      },
      {
        id: 'c_p6_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p6_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P7. Why location by GPS?
  promoter_p7_gps: {
    id: 'promoter_p7_gps',
    aiMessage:
      'Listeners willingly share their GPS location when signing up. This ensures your content reaches real people physically present in your chosen city or state, giving promoters exact local reach without wasted impressions.',
    referralLink: {
      label: 'Read Location Privacy Policy',
      url: '/privacy',
    },
    choices: [
      {
        id: 'c_p7_next',
        text: 'What is the minimum budget needed to test a campaign?',
        nextNodeId: 'promoter_p8_budget',
      },
      {
        id: 'c_p7_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p7_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P8. What is the minimum budget needed to test a campaign?
  promoter_p8_budget: {
    id: 'promoter_p8_budget',
    aiMessage:
      'Any amount you deem fit. You have complete freedom to test with a small budget and scale as you see results.',
    referralLink: {
      label: 'Read Campaign Funding Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_p8_next',
        text: 'How are contents reviewed and approved?',
        nextNodeId: 'promoter_p9_approval',
      },
      {
        id: 'c_p8_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p8_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P9. How are contents reviewed and approved?
  promoter_p9_approval: {
    id: 'promoter_p9_approval',
    aiMessage:
      'Your content must follow our guidelines before going live. When approved, it displays immediately, though members can report violations and actions can be taken under our terms.',
    referralLink: {
      label: 'Read Prohibited Content in Advertiser Guidelines',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_p9_next',
        text: 'What makes Paayh fairer?',
        nextNodeId: 'promoter_p10_fairer',
      },
      {
        id: 'c_p9_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p9_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P10. What makes Paayh fairer?
  promoter_p10_fairer: {
    id: 'promoter_p10_fairer',
    aiMessage:
      'Our aim is to deliver your content for maximum ROI while making listeners happy with real earnings, creating a win win environment that is genuinely good for business.',
    referralLink: {
      label: 'Read Platform Mission on About Page',
      url: '/about',
    },
    choices: [
      {
        id: 'c_p10_next',
        text: 'Why is Paayh built for humans?',
        nextNodeId: 'promoter_p11_human',
      },
      {
        id: 'c_p10_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p10_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P11. Why is Paayh built for humans?
  promoter_p11_human: {
    id: 'promoter_p11_human',
    aiMessage:
      'All promoters are targeting real humans because AI will not buy or use services. We dedicate serious engineering to prevent bots so your spend reaches real people.',
    referralLink: {
      label: 'Read Anti Bot Policy in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_p11_next',
        text: 'How does Proof of Human protect my budget?',
        nextNodeId: 'promoter_p11_poh',
      },
      {
        id: 'c_p11_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p11_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P11-POH. How does Proof of Human protect my budget?
  promoter_p11_poh: {
    id: 'promoter_p11_poh',
    aiMessage:
      'Every impression requires verified physical interaction before being counted. While nothing on the internet is 100% guaranteed, our multi-layer safeguards actively block automated bots and scripts to maximize genuine human engagement.',
    referralLink: {
      label: 'Review Platform Verification in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_p11_poh_next',
        text: 'Can I be both a listener and a promoter?',
        nextNodeId: 'promoter_p12_both',
      },
      {
        id: 'c_p11_poh_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p11_poh_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P12. Can I be both a listener and a promoter?
  promoter_p12_both: {
    id: 'promoter_p12_both',
    aiMessage:
      'Yes. You can promote your business and also explore other promotions to earn cash into your wallet anytime.',
    referralLink: {
      label: 'Read Promoter FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_p12_next',
        text: 'How do I get started right now?',
        nextNodeId: 'promoter_p13_start',
      },
      {
        id: 'c_p12_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p12_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // P13. How do I get started right now?
  promoter_p13_start: {
    id: 'promoter_p13_start',
    aiMessage:
      'Sign in with Google or Apple below to get started today.',
    referralLink: {
      label: 'Review Campaign Terms of Service',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_p13_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_p13_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
      {
        id: 'c_p13_restart',
        text: 'Explore from start',
        nextNodeId: 'root',
      },
    ],
  },
};
