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
  // 1. ROOT LAUNCHPAD
  root: {
    id: 'root',
    aiMessage: 'Welcome to Paayh. We are an attention exchange connecting businesses directly with real people. Advertisers receive genuine human attention for their offers, and listeners earn cash directly for their time. How may we assist you today?',
    choices: [
      {
        id: 'c_root_google',
        text: 'Sign in with Google',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
      {
        id: 'c_root_apple',
        text: 'Sign in with Apple',
        action: 'auth_apple',
        href: '/auth/login?connection=apple',
      },
      {
        id: 'c_root_how_it_works',
        text: 'How Paayh works',
        nextNodeId: 'how_works_select',
      },
    ],
  },

  // 2. HOW PAAYH WORKS
  how_works_select: {
    id: 'how_works_select',
    aiMessage: 'Paayh makes engagement simple and fair. When sponsors run campaigns, verified listeners who review them for 16 seconds receive cash rewards directly. Advertisers reach real interested buyers without bots. Which side would you like to explore?',
    referralLink: {
      label: 'Read Terms of Service',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_sel_listener',
        text: 'Earn cash for my attention',
        nextNodeId: 'path_listener_chosen',
      },
      {
        id: 'c_sel_promoter',
        text: 'Promote my business to real buyers',
        nextNodeId: 'path_promoter_chosen',
      },
      {
        id: 'c_sel_monopoly_truth',
        text: 'Why is Paayh fairer than big tech monopolies?',
        nextNodeId: 'trail_platform_monopoly_truth',
      },
    ],
  },

  // ==========================================
  // LISTENER TRACK (22 CHRONOLOGICAL NODES)
  // ==========================================

  // L1. EARNER CORE PATH
  path_listener_chosen: {
    id: 'path_listener_chosen',
    aiMessage: 'Earnings are never one fixed rate. Each category has its own cost per impression, and sponsors bid competitively for attention. A payout might be 50 Naira ($0.03 USD), 100 Naira ($0.07 USD), 2,000 Naira ($1.40 USD), or even 20,000 Naira ($14 USD) depending on the industry niche and auction competition. Review the offer for 16 seconds with honest intent, tap Earn, and pocket your cash.',
    referralLink: {
      label: 'View Earnings Breakdown in FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_lc_projections',
        text: 'Show projected daily, weekly, and monthly earnings',
        nextNodeId: 'trail_earnings_projections',
      },
      {
        id: 'c_lc_tap_rule',
        text: 'Do earnings credit automatically after 16 seconds?',
        nextNodeId: 'trail_tap_earn_mandatory',
      },
      {
        id: 'c_lc_google',
        text: 'Sign in with Google to start earning',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L2. EARNINGS PROJECTIONS (NUMERICAL BENCHMARK)
  trail_earnings_projections: {
    id: 'trail_earnings_projections',
    aiMessage: 'Here is an exciting breakdown. Reviewing 100 sponsored campaigns daily at an average 150 Naira ($0.10 USD) payout yields 15,000 Naira ($10 USD) daily, which grows to 105,000 Naira ($70 USD) weekly and 450,000 Naira ($300 USD) every month directly into your bank. In premium finance or tech categories with 500 to 2,000 Naira bids, a focused listener can generate 35,000 Naira daily, 245,000 Naira weekly, and over 1,000,000 Naira ($670 USD) monthly, effortlessly covering rent and family upkeep.',
    referralLink: {
      label: 'Read Withdrawal Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_ep_loan_sharks',
        text: 'How does this daily income end borrowing from loan sharks?',
        nextNodeId: 'trail_loan_sharks_relief',
      },
      {
        id: 'c_ep_tap_earn',
        text: 'Why must I tap the Earn button manually?',
        nextNodeId: 'trail_tap_earn_mandatory',
      },
      {
        id: 'c_ep_google',
        text: 'Sign in with Google to claim your share',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L3. RELIEF FROM PREDATORY LOAN SHARKS
  trail_loan_sharks_relief: {
    id: 'trail_loan_sharks_relief',
    aiMessage: 'Dedication to Paayh builds a reliable daily cash cushion that eliminates desperate, indiscriminate borrowing. When you earn steady daily income from your attention, you stop depending on predatory loan sharks and extortionate interest rates to cover urgent bills.',
    referralLink: {
      label: 'Read Financial Freedom Mission',
      url: '/about',
    },
    choices: [
      {
        id: 'c_ls_tap_earn',
        text: 'Do earnings credit automatically or do I tap a button?',
        nextNodeId: 'trail_tap_earn_mandatory',
      },
      {
        id: 'c_ls_non_monetized',
        text: 'Which content on the platform does not pay cash?',
        nextNodeId: 'trail_non_monetized_exclusions',
      },
      {
        id: 'c_ls_google',
        text: 'Sign in with Google to stop borrowing',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L4. TAP TO EARN & DWELL FREEDOM
  trail_tap_earn_mandatory: {
    id: 'trail_tap_earn_mandatory',
    aiMessage: 'Earnings do not add automatically after 16 seconds. You must deliberately tap the Earn button to claim your reward. The 16 second timer prevents premature tapping, though you are free to spend more time exploring the sponsor if you are interested.',
    referralLink: {
      label: 'Review Interaction Guidelines',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_te_non_monetized',
        text: 'Which content on the platform does not pay cash?',
        nextNodeId: 'trail_non_monetized_exclusions',
      },
      {
        id: 'c_te_voluntary',
        text: 'How do mutual free attention slots work?',
        nextNodeId: 'trail_voluntary_earn_mutual',
      },
      {
        id: 'c_te_google',
        text: 'Sign in with Google to start',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L5. NON MONETIZED CONTENT EXCLUSIONS
  trail_non_monetized_exclusions: {
    id: 'trail_non_monetized_exclusions',
    aiMessage: 'Cash credits accrue exclusively on paid commercial campaigns. Users cannot earn from mutual partner posts, official platform updates, platform jingles, promotional offers, or business daily highlights. Mutual posts represent reciprocal free attention exchanges, while platform communications and highlights carry zero commercial ad budget.',
    referralLink: {
      label: 'Read Content Policy in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_nm_mutual',
        text: 'How do mutual free attention slots work?',
        nextNodeId: 'trail_voluntary_earn_mutual',
      },
      {
        id: 'c_nm_eligibility',
        text: 'What are the requirements to get monetized?',
        nextNodeId: 'trail_monetization_eligibility',
      },
      {
        id: 'c_nm_google',
        text: 'Sign in with Google to browse',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L6. VOLUNTARY EARNING & MUTUAL SLOTS
  trail_voluntary_earn_mutual: {
    id: 'trail_voluntary_earn_mutual',
    aiMessage: 'Earning is voluntary. When you add a promoter as a mutual, their campaign slot is completely unbudgeted and free. The Earn button will not show on their ads even if you are monetized. In exchange, your own future campaign receives free attention slots from those mutuals without paying advertising fees.',
    referralLink: {
      label: 'Read Interaction Rules in FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_vm_eligibility',
        text: 'What are the requirements to get monetized?',
        nextNodeId: 'trail_monetization_eligibility',
      },
      {
        id: 'c_vm_monopoly',
        text: 'Why should users earn from ads instead of Google keeping it all?',
        nextNodeId: 'trail_platform_monopoly_truth',
      },
      {
        id: 'c_vm_google',
        text: 'Sign in with Google to participate',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L7. MONETIZATION ELIGIBILITY (300 INTERACTIONS)
  trail_monetization_eligibility: {
    id: 'trail_monetization_eligibility',
    aiMessage: 'To prevent bot farms and guarantee authentic engagement, new accounts must complete 300 verified interactions during regular browsing. Once qualified, monetization unlocks and you earn cash on every paid commercial view.',
    referralLink: {
      label: 'Review Monetization Standards',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_me_monopoly',
        text: 'Why should users earn from ads instead of Google keeping it all?',
        nextNodeId: 'trail_platform_monopoly_truth',
      },
      {
        id: 'c_me_creator',
        text: 'Why is Paayh simpler than social media content creation?',
        nextNodeId: 'trail_creator_economy_escape',
      },
      {
        id: 'c_me_google',
        text: 'Sign in with Google to start qualifying',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L8. PLATFORM AD MONOPOLY INVERSION (GOOGLE STANDARD)
  trail_platform_monopoly_truth: {
    id: 'trail_platform_monopoly_truth',
    aiMessage: 'Traditional search engines and social platforms make hundreds of billions running ad auctions off your attention while paying you zero. Paayh inverts this model. Advertisers bid for human attention, and the platform delivers those cash rewards straight into your wallet.',
    referralLink: {
      label: 'Our Fair Value Charter',
      url: '/about',
    },
    choices: [
      {
        id: 'c_pmt_creator',
        text: 'Why is this easier than becoming an online influencer?',
        nextNodeId: 'trail_creator_economy_escape',
      },
      {
        id: 'c_pmt_freedom',
        text: 'How does steady daily income change everyday living?',
        nextNodeId: 'trail_financial_relief_freedom',
      },
      {
        id: 'c_pmt_google',
        text: 'Sign in with Google to claim ad revenue',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L9. ESCAPING CREATOR BURNOUT
  trail_creator_economy_escape: {
    id: 'trail_creator_economy_escape',
    aiMessage: 'Traditional content creation demands expensive cameras, humiliating stunts for clout, and endless algorithm chasing that rarely pays viewers. On Paayh, you need zero followers and zero equipment. Just 16 seconds of your honest attention earns predictable cash.',
    referralLink: {
      label: 'Our Mission on About Page',
      url: '/about',
    },
    choices: [
      {
        id: 'c_ce_freedom',
        text: 'How does steady daily income change everyday living?',
        nextNodeId: 'trail_financial_relief_freedom',
      },
      {
        id: 'c_ce_countdown',
        text: 'How does the 16 second focus countdown work?',
        nextNodeId: 'trail_countdown_rules',
      },
      {
        id: 'c_ce_google',
        text: 'Sign in with Google to join Paayh',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L10. FINANCIAL INDEPENDENCE & BUFFER
  trail_financial_relief_freedom: {
    id: 'trail_financial_relief_freedom',
    aiMessage: 'People tolerate abusive jobs and unfair treatment when they lack an immediate income buffer. Paayh provides a daily cash flow that restores personal dignity and bargaining power in your daily life.',
    referralLink: {
      label: 'Read Community Policies',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_fr_countdown',
        text: 'How does the 16 second focus countdown work?',
        nextNodeId: 'trail_countdown_rules',
      },
      {
        id: 'c_fr_retargeting',
        text: 'Do I earn extra on retargeted campaigns?',
        nextNodeId: 'trail_retargeting_earnings',
      },
      {
        id: 'c_fr_google',
        text: 'Sign in with Google to secure extra cash',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L11. 16 SECONDS FOCUS RULES & DWELL
  trail_countdown_rules: {
    id: 'trail_countdown_rules',
    aiMessage: 'Each ad requires an uninterrupted 16 second focus timer before the Earn button unlocks. This ensures advertisers receive authentic dwell time and protects listeners from robotic competition. After 16 seconds, tap Earn or stay longer if the offer interests you.',
    referralLink: {
      label: 'Review Community Rules',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_cd_retargeting',
        text: 'Do I earn extra on retargeted campaigns?',
        nextNodeId: 'trail_retargeting_earnings',
      },
      {
        id: 'c_cd_payout',
        text: 'How do wallet bank withdrawals work?',
        nextNodeId: 'trail_payout_mechanics',
      },
      {
        id: 'c_cd_google',
        text: 'Sign in with Google to join',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L12. RETARGETING EARNINGS
  trail_retargeting_earnings: {
    id: 'trail_retargeting_earnings',
    aiMessage: 'Advertisers frequently retarget interested listeners with higher frequency caps. Whenever a campaign appears in your feed again, you earn full cash rewards for every completed 16 second view.',
    referralLink: {
      label: 'Read Monetization FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_re_payout',
        text: 'How do wallet bank withdrawals work?',
        nextNodeId: 'trail_payout_mechanics',
      },
      {
        id: 'c_re_banks',
        text: 'Which commercial banks are supported for payout?',
        nextNodeId: 'trail_supported_banks',
      },
      {
        id: 'c_re_google',
        text: 'Sign in with Google to start earning',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L13. PAYOUT MECHANICS & BANK WITHDRAWALS
  trail_payout_mechanics: {
    id: 'trail_payout_mechanics',
    aiMessage: 'Earnings credit after every verified view where you tap Earn. Once your balance reaches 10,000 Naira ($7 USD), you can withdraw directly into any Nigerian commercial bank account or transfer internally. You must withdraw before hitting your tier limit, as earnings beyond your cap are permanently forfeited.',
    referralLink: {
      label: 'View Withdrawal Policy',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_pm_banks',
        text: 'Which commercial banks can I withdraw to?',
        nextNodeId: 'trail_supported_banks',
      },
      {
        id: 'c_pm_fees',
        text: 'Are there any hidden fees on withdrawals?',
        nextNodeId: 'trail_withdrawal_fees_transparency',
      },
      {
        id: 'c_pm_google',
        text: 'Sign in with Google to start earning',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L14. SUPPORTED BANKS & DISBURSEMENT SPEED
  trail_supported_banks: {
    id: 'trail_supported_banks',
    aiMessage: 'We disburse funds through licensed Central Bank of Nigeria settlement partners to all major commercial banks, including GTBank, Access, Zenith, UBA, First Bank, and Kuda. Disbursements process promptly upon request.',
    referralLink: {
      label: 'View Banking FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_sb_fees',
        text: 'Are there any hidden deductions or maintenance fees?',
        nextNodeId: 'trail_withdrawal_fees_transparency',
      },
      {
        id: 'c_sb_limits',
        text: 'What is the maximum balance I can store?',
        nextNodeId: 'trail_atw_tier_limits',
      },
      {
        id: 'c_sb_google',
        text: 'Sign in with Google to setup payout',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L15. WITHDRAWAL FEES TRANSPARENCY
  trail_withdrawal_fees_transparency: {
    id: 'trail_withdrawal_fees_transparency',
    aiMessage: 'Paayh charges zero hidden maintenance fees. What you earn belongs entirely to you. You can withdraw your full eligible balance anytime you meet the 10,000 Naira milestone.',
    referralLink: {
      label: 'Read Financial Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_wf_atw',
        text: 'What is the maximum balance I can store?',
        nextNodeId: 'trail_atw_tier_limits',
      },
      {
        id: 'c_wf_internal',
        text: 'Can I send money directly to a friend on Paayh?',
        nextNodeId: 'trail_internal_transfers',
      },
      {
        id: 'c_wf_google',
        text: 'Sign in with Google to participate',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L16. ATW TIER LIMITS & ANTI HOARDING
  trail_atw_tier_limits: {
    id: 'trail_atw_tier_limits',
    aiMessage: 'Paayh enforces an Attention Worth Tier holding cap between 30,000 Naira ($20 USD) and 90,000 Naira ($60 USD). Because we are an attention exchange and not a deposit bank, withdrawing regularly keeps your funds secure.',
    referralLink: {
      label: 'Read ATW Ceiling Rules',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_at_internal',
        text: 'Can I transfer credits to another member?',
        nextNodeId: 'trail_internal_transfers',
      },
      {
        id: 'c_at_daily_limits',
        text: 'How many campaigns can I review in one day?',
        nextNodeId: 'trail_daily_view_limits',
      },
      {
        id: 'c_at_google',
        text: 'Sign in with Google to begin',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L17. INTERNAL TRANSFERS BETWEEN MEMBERS
  trail_internal_transfers: {
    id: 'trail_internal_transfers',
    aiMessage: 'You can transfer earned credits instantly to any other Paayh member with zero friction. This enables friends and families to pool earnings together for household needs or commercial campaigns.',
    referralLink: {
      label: 'Read Member Transfer Rules',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_it_daily_limits',
        text: 'How many campaigns can I review in one day?',
        nextNodeId: 'trail_daily_view_limits',
      },
      {
        id: 'c_it_currency',
        text: 'Can international users outside Nigeria earn?',
        nextNodeId: 'trail_international_currency',
      },
      {
        id: 'c_it_google',
        text: 'Sign in with Google to transfer funds',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L18. DAILY VIEW LIMITS & FAIR PACING
  trail_daily_view_limits: {
    id: 'trail_daily_view_limits',
    aiMessage: 'To prevent fatigue and preserve high advertiser value, Paayh incorporates fair pacing intervals. New campaign batches refresh across the day as sponsors launch promotions in your area.',
    referralLink: {
      label: 'Read Fair Pacing Architecture',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_dv_currency',
        text: 'Can international users participate and earn?',
        nextNodeId: 'trail_international_currency',
      },
      {
        id: 'c_dv_inactivity',
        text: 'What happens if my account goes inactive?',
        nextNodeId: 'trail_inactivity_rules',
      },
      {
        id: 'c_dv_google',
        text: 'Sign in with Google to get started',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L19. INTERNATIONAL CURRENCY LOCALIZATION
  trail_international_currency: {
    id: 'trail_international_currency',
    aiMessage: 'While primary payouts originate in Naira, Paayh welcomes international participants. Thresholds and wallet values compute real time US Dollar equivalents based on current exchange benchmarks.',
    referralLink: {
      label: 'International Participation FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_ic_inactivity',
        text: 'What happens if my account goes inactive?',
        nextNodeId: 'trail_inactivity_rules',
      },
      {
        id: 'c_ic_both',
        text: 'Can I use my attention earnings to promote my own business?',
        nextNodeId: 'path_both_chosen',
      },
      {
        id: 'c_ic_google',
        text: 'Sign in with Google to earn anywhere',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L20. INACTIVITY RULES & ACCOUNT STATUS
  trail_inactivity_rules: {
    id: 'trail_inactivity_rules',
    aiMessage: 'If an account remains inactive for 7 consecutive days, monetization status pauses until renewed through regular engagement. Accounts dormant for 60 consecutive days risk credit forfeiture under our policy.',
    referralLink: {
      label: 'Review Inactivity Guidelines',
      url: '/terms#inactivity-guidelines',
    },
    choices: [
      {
        id: 'c_ir_both',
        text: 'Can I use my attention earnings to promote my own business?',
        nextNodeId: 'path_both_chosen',
      },
      {
        id: 'c_ir_policy',
        text: 'Where can I read the full terms and policies?',
        nextNodeId: 'trail_policy_links',
      },
      {
        id: 'c_ir_google',
        text: 'Sign in with Google to stay active',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L21. CHOSEN: BOTH (GROW AS ADVERTISER & EARNER)
  path_both_chosen: {
    id: 'path_both_chosen',
    aiMessage: 'You can earn cash as an attentive listener, then reinvest your accumulated balance directly into promoting your own products. You reach verified local buyers without paying middleman advertising agency markups.',
    referralLink: {
      label: 'Explore Our Platform FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_bc_promoter',
        text: 'How does advertising my business on Paayh work?',
        nextNodeId: 'path_promoter_chosen',
      },
      {
        id: 'c_bc_policy',
        text: 'Where can I read the full terms and policies?',
        nextNodeId: 'trail_policy_links',
      },
      {
        id: 'c_bc_google',
        text: 'Sign in with Google to do both',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // L22. DIRECT POLICY LINKS
  trail_policy_links: {
    id: 'trail_policy_links',
    aiMessage: 'You may inspect our governing terms, privacy charter, and advertiser guidelines below:',
    choices: [
      {
        id: 'c_link_terms',
        text: 'Read our Terms of Service',
        action: 'link',
        href: '/terms',
      },
      {
        id: 'c_link_privacy',
        text: 'Read our Privacy Policy',
        action: 'link',
        href: '/privacy',
      },
      {
        id: 'c_link_guidelines',
        text: 'Read Advertiser Guidelines',
        action: 'link',
        href: '/advertiser-guidelines',
      },
      {
        id: 'c_link_faq',
        text: 'Read our Frequently Asked Questions',
        action: 'link',
        href: '/faq',
      },
    ],
  },

  // ==========================================
  // PROMOTER TRACK (20 CHRONOLOGICAL NODES)
  // ==========================================

  // P1. PROMOTER CORE PATH
  path_promoter_chosen: {
    id: 'path_promoter_chosen',
    aiMessage: 'On social media, users scroll past sponsored posts in under half a second. On Paayh, verified adults voluntarily commit 16 seconds of undivided focus to your offer. No begging for attention. Just present your best deal to real buyers.',
    referralLink: {
      label: 'Read Advertiser Guidelines',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_pc_bidding',
        text: 'How does bidding for attention work?',
        nextNodeId: 'trail_bidding_attention',
      },
      {
        id: 'c_pc_model',
        text: 'How does Paayh compare to Google ads and direct models like Tesla?',
        nextNodeId: 'trail_promoter_google_tesla_model',
      },
      {
        id: 'c_pc_google',
        text: 'Sign in with Google to promote',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P2. BIDDING FOR ATTENTION
  trail_bidding_attention: {
    id: 'trail_bidding_attention',
    aiMessage: 'Promoters bid for top placement in listener feeds. Higher bids display your offer first and reward listeners with higher payouts, generating instant brand goodwill and genuine enthusiasm to buy.',
    referralLink: {
      label: 'Read Bidding Guidelines',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_ba_model',
        text: 'How does Paayh compare to Google ads and direct models like Tesla?',
        nextNodeId: 'trail_promoter_google_tesla_model',
      },
      {
        id: 'c_ba_gps',
        text: 'How does GPS targeting guarantee genuine local buyers?',
        nextNodeId: 'trail_gps_targeting',
      },
      {
        id: 'c_ba_google',
        text: 'Sign in with Google to deploy ads',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P3. GOOGLE VS TESLA DIRECT ADVERTISING STANDARD
  trail_promoter_google_tesla_model: {
    id: 'trail_promoter_google_tesla_model',
    aiMessage: 'Google charges hefty click fees even when visitors leave in two seconds, while Tesla succeeded by eliminating dealer middlemen to deal directly with consumers. Paayh combines direct customer connection with guaranteed 16 second dwell time so your ad spend actually converts.',
    referralLink: {
      label: 'Compare Advertising Value',
      url: '/about',
    },
    choices: [
      {
        id: 'c_gtm_gps',
        text: 'How does GPS targeting guarantee real local buyers?',
        nextNodeId: 'trail_gps_targeting',
      },
      {
        id: 'c_gtm_creatives',
        text: 'What makes an ad creative convert fast on Paayh?',
        nextNodeId: 'trail_ad_creatives_advice',
      },
      {
        id: 'c_gtm_google',
        text: 'Sign in with Google to reach buyers',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P4. GPS LOCATION TARGETING
  trail_gps_targeting: {
    id: 'trail_gps_targeting',
    aiMessage: 'During profile setup, we request device location permissions to auto detect country, state, and city via browser GPS coordinates. These fields lock down as read only to prevent manual tampering, ensuring you reach verified residents in your target market.',
    referralLink: {
      label: 'Read Location Policy in Terms',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_gt_creatives',
        text: 'What makes an ad creative convert fast on Paayh?',
        nextNodeId: 'trail_ad_creatives_advice',
      },
      {
        id: 'c_gt_frequency',
        text: 'Why should I use frequency capping on my ads?',
        nextNodeId: 'trail_frequency_capping',
      },
      {
        id: 'c_gt_google',
        text: 'Sign in with Google to target customers',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P5. AD CREATIVE ADVICE
  trail_ad_creatives_advice: {
    id: 'trail_ad_creatives_advice',
    aiMessage: 'Avoid lengthy introductions or clickbait. Because viewers are already paying undivided attention, state your value immediately: what you sell, your special pricing or discount, and how to place an order today.',
    referralLink: {
      label: 'Advertiser Best Practices',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_ca_frequency',
        text: 'How does frequency capping drive repeat purchases?',
        nextNodeId: 'trail_frequency_capping',
      },
      {
        id: 'c_ca_formats',
        text: 'What ad formats are available on Paayh?',
        nextNodeId: 'trail_highlights_adverts',
      },
      {
        id: 'c_ca_google',
        text: 'Sign in with Google to launch campaign',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P6. FREQUENCY CAPPING
  trail_frequency_capping: {
    id: 'trail_frequency_capping',
    aiMessage: 'Buyers rarely purchase on their first exposure. Setting a frequency cap between 3 and 7 ensures verified listeners see your offer multiple times across your campaign, building deep memory and purchase confidence.',
    referralLink: {
      label: 'Explore Platform FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_fc_formats',
        text: 'What ad formats can I choose from?',
        nextNodeId: 'trail_highlights_adverts',
      },
      {
        id: 'c_fc_mutual',
        text: 'How do mutual free campaign slots work?',
        nextNodeId: 'trail_promoter_mutual_explained',
      },
      {
        id: 'c_fc_google',
        text: 'Sign in with Google to launch ads',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P7. PROMOTER FORMATS (FEED ADS & HIGHLIGHTS)
  trail_highlights_adverts: {
    id: 'trail_highlights_adverts',
    aiMessage: 'Run standard interactive feed promotions for steady daily inquiries, or deploy 24 hour flash Highlights that broadcast network wide every 10 minutes for immediate product launches.',
    referralLink: {
      label: 'Learn More in FAQs',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_ha_mutual',
        text: 'How do mutual free campaign slots help small businesses?',
        nextNodeId: 'trail_promoter_mutual_explained',
      },
      {
        id: 'c_ha_cta',
        text: 'Which call to action channels can I connect?',
        nextNodeId: 'trail_call_to_action_channels',
      },
      {
        id: 'c_ha_google',
        text: 'Sign in with Google to get started',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P8. PROMOTER MUTUAL SYSTEM EXPLAINED
  trail_promoter_mutual_explained: {
    id: 'trail_promoter_mutual_explained',
    aiMessage: 'Mutuals provide free reciprocal reach. When a fellow member adds you as a mutual, they review your ad without earning cash, costing you zero impression fees. In return, you review their offers as unbudgeted mutual slots.',
    referralLink: {
      label: 'Read Mutual Network Rules',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_pme_cta',
        text: 'Which call to action channels can I connect to my ad?',
        nextNodeId: 'trail_call_to_action_channels',
      },
      {
        id: 'c_pme_analytics',
        text: 'What live analytics do advertisers see on their dashboard?',
        nextNodeId: 'trail_advertiser_analytics',
      },
      {
        id: 'c_pme_google',
        text: 'Sign in with Google to connect mutuals',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P9. CALL TO ACTION CHANNELS (WHATSAPP, PHONE, WEB)
  trail_call_to_action_channels: {
    id: 'trail_call_to_action_channels',
    aiMessage: 'Paayh supports direct WhatsApp chat links, one touch phone calls, custom website URLs, and app download links. Listeners transition smoothly from reviewing your offer to messaging you directly.',
    referralLink: {
      label: 'Read Channel Specifications',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_cta_analytics',
        text: 'What live metrics will I see on my dashboard?',
        nextNodeId: 'trail_advertiser_analytics',
      },
      {
        id: 'c_cta_bot',
        text: 'How does Paayh defend against bots and fake impressions?',
        nextNodeId: 'trail_bot_defense',
      },
      {
        id: 'c_cta_google',
        text: 'Sign in with Google to setup CTA buttons',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P10. ADVERTISER ANALYTICS & CONVERSION TRACKING
  trail_advertiser_analytics: {
    id: 'trail_advertiser_analytics',
    aiMessage: 'Track every interaction in real time on your advertiser dashboard. Monitor confirmed impressions, completed 16 second dwell events, WhatsApp click through rates, and geographic reach across Nigerian states.',
    referralLink: {
      label: 'Review Dashboard Features',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_aa_bot',
        text: 'How does Paayh defend against click farms and bots?',
        nextNodeId: 'trail_bot_defense',
      },
      {
        id: 'c_aa_budget',
        text: 'What are the budget rules and payment policies?',
        nextNodeId: 'trail_ad_budget_flexibility',
      },
      {
        id: 'c_aa_google',
        text: 'Sign in with Google to view live stats',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P11. BOT DEFENSE & REAL HUMAN AUDIT
  trail_bot_defense: {
    id: 'trail_bot_defense',
    aiMessage: 'We protect advertiser budgets using cryptographic challenge tokens, behavioral dwell checks, and browser GPS verification. You never waste ad budget on automated scripts or synthetic bots.',
    referralLink: {
      label: 'Anti Fraud Architecture',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_bd_budget',
        text: 'What are the budget rules and payment terms?',
        nextNodeId: 'trail_ad_budget_flexibility',
      },
      {
        id: 'c_bd_approval',
        text: 'How fast are ads reviewed and approved?',
        nextNodeId: 'trail_ad_approval_speed',
      },
      {
        id: 'c_bd_google',
        text: 'Sign in with Google to advertise',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P12. AD BUDGET FLEXIBILITY & NON REFUNDABLE INFRASTRUCTURE
  trail_ad_budget_flexibility: {
    id: 'trail_ad_budget_flexibility',
    aiMessage: 'Campaign payments are strictly non refundable once funded, covering locked digital infrastructure and bandwidth. Funds are not deducted to directly pay users; Paayh discretionarily rewards listeners from platform liquidity. We strongly advise running a modest test campaign first before committing larger sums.',
    referralLink: {
      label: 'Read Campaign Terms in Section 4',
      url: '/terms',
    },
    choices: [
      {
        id: 'c_bf_approval',
        text: 'How are campaigns reviewed and what can be advertised?',
        nextNodeId: 'trail_ad_approval_speed',
      },
      {
        id: 'c_bf_standards',
        text: 'What content standards and safety rules apply to ads?',
        nextNodeId: 'trail_promoter_content_standards',
      },
      {
        id: 'c_bf_google',
        text: 'Sign in with Google to fund campaign',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P13. AD APPROVAL & REVIEW SPEED
  trail_ad_approval_speed: {
    id: 'trail_ad_approval_speed',
    aiMessage: 'Campaigns require appropriate review time to verify compliance with our advertising guidelines. Not every submission qualifies for approval. You must read our terms and agree to our standards before publishing.',
    referralLink: {
      label: 'Read Advertiser Guidelines',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_as_standards',
        text: 'What specific items are prohibited from advertising?',
        nextNodeId: 'trail_promoter_content_standards',
      },
      {
        id: 'c_as_test',
        text: 'How should I structure a small test campaign?',
        nextNodeId: 'trail_promoter_test_campaign',
      },
      {
        id: 'c_as_google',
        text: 'Sign in with Google to submit an ad',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P14. CONTENT STANDARDS & PROHIBITED GOODS
  trail_promoter_content_standards: {
    id: 'trail_promoter_content_standards',
    aiMessage: 'We strictly prohibit deceptive schemes, unverified financial products, adult content, counterfeit merchandise, and misleading claims. Legitimate commercial goods, professional services, mobile apps, and events are approved smoothly.',
    referralLink: {
      label: 'Read Prohibited Items List',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_pcs_test',
        text: 'How do I run a small test ad to test conversion?',
        nextNodeId: 'trail_promoter_test_campaign',
      },
      {
        id: 'c_pcs_dayparting',
        text: 'Can I schedule my campaigns for specific peak hours?',
        nextNodeId: 'trail_promoter_dayparting',
      },
      {
        id: 'c_pcs_google',
        text: 'Sign in with Google to verify eligibility',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P15. RUNNING A MODEST TEST CAMPAIGN
  trail_promoter_test_campaign: {
    id: 'trail_promoter_test_campaign',
    aiMessage: 'Start with a modest test budget targeting your primary city. Direct listeners to your WhatsApp business line to test response speed, customer questions, and conversion before expanding your audience.',
    referralLink: {
      label: 'Test Campaign Blueprint',
      url: '/advertiser-guidelines',
    },
    choices: [
      {
        id: 'c_ptc_dayparting',
        text: 'Can I schedule campaigns for specific peak buying hours?',
        nextNodeId: 'trail_promoter_dayparting',
      },
      {
        id: 'c_ptc_retargeting',
        text: 'How does retargeting interested listeners increase sales?',
        nextNodeId: 'trail_promoter_retargeting_strategy',
      },
      {
        id: 'c_ptc_google',
        text: 'Sign in with Google to test campaign',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P16. CAMPAIGN SCHEDULING & PEAK HOURS (DAYPARTING)
  trail_promoter_dayparting: {
    id: 'trail_promoter_dayparting',
    aiMessage: 'Align your campaign distribution with your business operating hours. Delivering impressions when your sales team is active ensures immediate WhatsApp replies, leading to significantly higher closed sales.',
    referralLink: {
      label: 'Read Scheduling Guidelines',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_pdp_retargeting',
        text: 'How does retargeting interested listeners work?',
        nextNodeId: 'trail_promoter_retargeting_strategy',
      },
      {
        id: 'c_pdp_regional',
        text: 'Can I target specific states and cities across Nigeria?',
        nextNodeId: 'trail_promoter_regional_reach',
      },
      {
        id: 'c_pdp_google',
        text: 'Sign in with Google to schedule ads',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P17. RETARGETING HIGH INTENT AUDIENCES
  trail_promoter_retargeting_strategy: {
    id: 'trail_promoter_retargeting_strategy',
    aiMessage: 'Listeners who already completed a 16 second review are familiar with your brand. Showing your campaign to them again reinforces your value proposition and turns initial curiosity into paid customer orders.',
    referralLink: {
      label: 'Read Retargeting Strategies',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_prs_regional',
        text: 'Can I target specific states and cities across Nigeria?',
        nextNodeId: 'trail_promoter_regional_reach',
      },
      {
        id: 'c_prs_dual',
        text: 'Can I also earn cash as an attentive listener?',
        nextNodeId: 'trail_promoter_dual_growth',
      },
      {
        id: 'c_prs_google',
        text: 'Sign in with Google to retarget buyers',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P18. REGIONAL TARGETING ACROSS NIGERIA
  trail_promoter_regional_reach: {
    id: 'trail_promoter_regional_reach',
    aiMessage: 'Whether you operate a local store in Lagos, Abuja, or Port Harcourt, or ship nationwide, your campaign distributes strictly to verified residents in your selected regions.',
    referralLink: {
      label: 'Read Geographic Coverage',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_prr_dual',
        text: 'Can I also earn cash as an attentive listener?',
        nextNodeId: 'trail_promoter_dual_growth',
      },
      {
        id: 'c_prr_legal',
        text: 'Where can I review full legal compliance and terms?',
        nextNodeId: 'trail_promoter_legal_compliance',
      },
      {
        id: 'c_prr_google',
        text: 'Sign in with Google for local targeting',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P19. DUAL ROLE: PROMOTING & EARNING
  trail_promoter_dual_growth: {
    id: 'trail_promoter_dual_growth',
    aiMessage: 'Every Paayh member can promote a business and earn cash as a listener. You can review sponsored offers in your spare time and reinvest your rewards into growing your business without external financing.',
    referralLink: {
      label: 'Explore Dual Accounts',
      url: '/faq',
    },
    choices: [
      {
        id: 'c_pdg_legal',
        text: 'Where can I review complete advertiser policies and terms?',
        nextNodeId: 'trail_promoter_legal_compliance',
      },
      {
        id: 'c_pdg_projections',
        text: 'Show me projected listener earnings with figures',
        nextNodeId: 'trail_earnings_projections',
      },
      {
        id: 'c_pdg_google',
        text: 'Sign in with Google for dual growth',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },

  // P20. LEGAL COMPLIANCE & GUIDELINES HUB
  trail_promoter_legal_compliance: {
    id: 'trail_promoter_legal_compliance',
    aiMessage: 'Review our complete terms, advertiser guidelines, and privacy charter to ensure full alignment with our community standards before launching.',
    choices: [
      {
        id: 'c_plc_guidelines',
        text: 'Read Advertiser Guidelines',
        action: 'link',
        href: '/advertiser-guidelines',
      },
      {
        id: 'c_plc_terms',
        text: 'Read Terms of Service',
        action: 'link',
        href: '/terms',
      },
      {
        id: 'c_plc_faq',
        text: 'Read Frequently Asked Questions',
        action: 'link',
        href: '/faq',
      },
      {
        id: 'c_plc_google',
        text: 'Sign in with Google to start advertising',
        action: 'auth_google',
        href: '/auth/login?connection=google-oauth2',
      },
    ],
  },
};
