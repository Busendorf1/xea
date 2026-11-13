import type { FlowNode } from './flowTypes';

export const listenerFlowNodes: Record<string, FlowNode> = {
  // ==========================================
  // 1. OPENING HOOK (AFTER "LET'S GO")
  // ==========================================
  root: {
    id: 'root',
    aiMessage:
      'Paayh is an attention and content discovery platform. Viewing content is voluntary, for fun and discovery of products, services, and community updates, with a decent reward you won’t wanna miss for verified human focus. Posting promotional content is voluntary, requiring standard service charges for placement and queue delivery.',
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
      'We connect verified community content with people who voluntarily choose to see it. Are you looking to promote your business, or are you here to discover offers and earn rewards for your attention?',
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
        text: 'Discover & Earn Rewards',
        nextNodeId: 'listener_l1',
      },
      {
        id: 'c_hw_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_hw_apple',
        text: 'Continue with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
    ],
  },

  // ==========================================
  // TRACK A: LISTENER TRACK ("EARN CASH FOR ATTENTION")
  // ==========================================

  // L1. Earn Cash for Attention
  listener_l1: {
    id: 'listener_l1',
    aiMessage:
      '“We believe viewers deserve a share of the advertising revenue\ntheir attention generates. It’s a fair, human-centered economic model.”',
    referralLink: {
      label: 'Read Earning Guidelines in our FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_l1_next',
        text: 'How to get started?',
        nextNodeId: 'listener_l1_start',
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

  // L1-Start. How to get started?
  listener_l1_start: {
    id: 'listener_l1_start',
    aiMessage:
      'Sign up, pick your interests, and view matching content. When the 16 second countdown ends, tap the Earn button. Your earnings update immediately in your wallet.',
    referralLink: {
      label: 'Read Earning Guidelines in our FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_l1_start_next',
        text: 'Why 16 second countdown?',
        nextNodeId: 'listener_l2',
      },
      {
        id: 'c_l1_start_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l1_start_apple',
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
    'You can earn a decent reward you won’t wanna miss! Rewards fluctuate with advertiser campaign budgets and verified focus, making each session rewarding and worthwhile.',
    referralLink: {
      label: 'Read Payout Rules in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l3_next',
        text: 'How and when do I withdraw my rewards?',
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
      'When your balance reaches the minimum threshold of 10,000 Naira (or localized currency equivalent) and before reaching your ATW holding limit, tap Request Withdrawal. Enter your bank details and verified phone number, it is that simple.',
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
      'There are zero account maintenance fees. When you initiate a withdrawal, standard statutory payment processor interbank transfer fees apply with zero platform markup, and the net payout is credited to your verified bank account.',
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
        text: 'How does Proof of Human work?',
        nextNodeId: 'listener_l7_poh',
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

  // L7-POH. How does Proof of Human work?
  listener_l7_poh: {
    id: 'listener_l7_poh',
    aiMessage:
      'When the timer ends, a simple natural touch gesture confirms you are human before crediting your wallet. This keeps your earnings secure and protects you from automated bot competition.',
    referralLink: {
      label: 'Review Interaction Standards in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_l7_poh_next',
        text: 'Can I be both a listener and a promoter?',
        nextNodeId: 'listener_l8',
      },
      {
        id: 'c_l7_poh_google',
        text: 'Continue with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_l7_poh_apple',
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
};
