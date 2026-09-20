export interface FlowChoice {
  id: string;
  text: string;
  nextNodeId?: string;
  action?: 'auth_google' | 'auth_apple' | 'auth_general' | 'link';
  href?: string;
}

export interface FlowNode {
  id: string;
  aiMessage: string;
  metaNote?: string;
  referralLink?: {
    label: string;
    url: string;
  };
  choices: FlowChoice[];
}

export const initialNodeId = 'root';

export const flowNodes: Record<string, FlowNode> = {
  // ==========================================
  // 1. OPENING HOOK (AFTER "LET'S GO")
  // ==========================================
  root: {
    id: 'root',
    aiMessage:
      'Paayh is an attention exchange. Our goal is to deliver your advert and content for maximum ROI while rewarding listeners for their attention, which is win-win for businesses and viewers.',
    referralLink: {
      label: 'Read our Platform Terms of Service',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_root_works',
        text: 'How Paayh works',
        nextNodeId: 'how_works_select',
      },
      {
        id: 'c_root_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_root_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // ==========================================
  // 2. THE FORK: HOW PAAYH WORKS
  // ==========================================
  how_works_select: {
    id: 'how_works_select',
    aiMessage:
      'We deliver your content to people who genuinely want to see it and reward them with earnings. Are you looking to promote your business, or are you here to earn cash for your attention?',
    referralLink: {
      label: 'Review Platform Terms of Service',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_hw_promoter',
        text: 'Promote My Business',
        nextNodeId: 'promoter_p1',
      },
      {
        id: 'c_hw_listener',
        text: 'Earn Cash for Attention',
        nextNodeId: 'listener_l1',
      },
      {
        id: 'c_hw_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // ==========================================
  // TRACK A: LISTENER TRACK ("EARN CASH FOR ATTENTION")
  // ==========================================

  // L1. How do I earn on Paayh?
  listener_l1: {
    id: 'listener_l1',
    aiMessage:
      'Sign up, pick your interests, and view matching content. When the 16 second countdown ends, tap the Earn button. Your earnings update immediately in your wallet.',
    referralLink: {
      label: 'Read Earning Guidelines in our FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_l1_next',
        text: 'Why 16 second countdown?',
        nextNodeId: 'listener_l2',
      },
      {
        id: 'c_l1_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l1_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L2. Why 16 second countdown?
  listener_l2: {
    id: 'listener_l2',
    aiMessage:
      'It gives you the mandatory time to read and view the content before you earn from it. This ensures fair value for promoters and keeps your payouts secure.',
    referralLink: {
      label: 'Review Interaction Standards in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l2_next',
        text: 'How much can I expect to earn?',
        nextNodeId: 'listener_l3',
      },
      {
        id: 'c_l2_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l2_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L3. How much can I expect to earn?
  listener_l3: {
    id: 'listener_l3',
    aiMessage:
      'At an average ₦500 payout and 50 views per hour, 8 daily hours yields ₦200,000 daily, ₦1.4M weekly or ₦5.6M monthly or USD equivalent. Payouts fluctuate with advertiser bidding, making each session rewarding and unpredictable.',
    referralLink: {
      label: 'Read Payout Rules in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l3_next',
        text: 'How and when do I withdraw my earnings?',
        nextNodeId: 'listener_l4',
      },
      {
        id: 'c_l3_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l3_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L4. How and when do I withdraw my earnings?
  listener_l4: {
    id: 'listener_l4',
    aiMessage:
      'When your balance reaches 10,000 Naira or dollar equivalent and before reaching your ATW limit, tap Request Withdrawal. Enter your bank details and phone number, it is that simple.',
    referralLink: {
      label: 'Read Banking Settlement FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_l4_next',
        text: 'Are there any withdrawal fees?',
        nextNodeId: 'listener_l5',
      },
      {
        id: 'c_l4_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l4_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L5. Are there any withdrawal fees?
  listener_l5: {
    id: 'listener_l5',
    aiMessage:
      'Not at all. There are zero maintenance fees and zero deductions. What you earn belongs entirely to you.',
    referralLink: {
      label: 'Read Financial Transparency Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l5_next',
        text: 'Why monetization?',
        nextNodeId: 'listener_l6',
      },
      {
        id: 'c_l5_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l5_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L6. Why monetization?
  listener_l6: {
    id: 'listener_l6',
    aiMessage:
      'You need at least 300 verified views to unlock full monetization. For Paayh, this shows genuine commitment and ensures our community consists of dedicated, authentic people.',
    referralLink: {
      label: 'Review Monetization Policy in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l6_next',
        text: 'Why is Paayh built for humans?',
        nextNodeId: 'listener_l7',
      },
      {
        id: 'c_l6_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l6_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L7. Why is Paayh built for humans?
  listener_l7: {
    id: 'listener_l7',
    aiMessage:
      'Promoters want real human customers because AI will not buy products or use their services. We put extensive effort into preventing bots so rewards go strictly to real people.',
    referralLink: {
      label: 'Read Our Human First Charter on About Page',
      url: '/about',
    },
    choices: [
      {
        id: 'c_l7_next',
        text: 'Can I be both a listener and a promoter?',
        nextNodeId: 'listener_l8',
      },
      {
        id: 'c_l7_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l7_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L8. Can I be both a listener and a promoter?
  listener_l8: {
    id: 'listener_l8',
    aiMessage:
      'Yes. You can earn as a listener and also use your accumulated wallet earnings to promote your own content to the community.',
    referralLink: {
      label: 'Read Community Participation Rules',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l8_next',
        text: 'How do I get started right now?',
        nextNodeId: 'listener_l9',
      },
      {
        id: 'c_l8_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l8_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // L9. How do I get started right now?
  listener_l9: {
    id: 'listener_l9',
    aiMessage:
      'Choose Google or Apple below to create your account in seconds and begin viewing content tailored to your personal interests.',
    referralLink: {
      label: 'Review Registration Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l9_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l9_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
      {
        id: 'c_l9_restart',
        text: 'Explore from start',
        nextNodeId: 'root',
      },
    ],
  },

  // ==========================================
  // TRACK B: PROMOTER TRACK ("PROMOTE MY BUSINESS")
  // ==========================================

  // P1. Why should a business advertise on Paayh?
  promoter_p1: {
    id: 'promoter_p1',
    aiMessage:
      'Paayh has a community of listeners eager to earn from the content they view, whether displaced by AI or seeking extra cash. Because they earn, they never skip content and have real money to patronize offers that resonate.',
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
        text: 'Can I be both a listener and a promoter?',
        nextNodeId: 'promoter_p12_both',
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

// Aliases for backwards compatibility with any persisted user sessions in browser localStorage
flowNodes['path_listener_chosen'] = flowNodes['listener_l1'];
flowNodes['path_promoter_chosen'] = flowNodes['promoter_p1'];
