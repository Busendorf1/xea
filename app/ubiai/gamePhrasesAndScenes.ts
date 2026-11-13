import type { Choice, PhraseFamily, Scene } from './gameTypes';

export const phraseFamilies: PhraseFamily[] = [
  {
    "id": "caveat",
    "variants": [
      {
        "id": "one_honest_caveat",
        "reel": "ONE HONEST CAVEAT",
        "lead": "One honest caveat:",
        "inline": "one honest caveat:"
      },
      {
        "id": "stating_precisely",
        "reel": "ONE THING WORTH STATING PRECISELY",
        "lead": "One thing worth stating precisely:",
        "inline": "one thing worth stating precisely:"
      },
      {
        "id": "worth_flagging",
        "reel": "ONE THING WORTH FLAGGING",
        "lead": "One thing worth flagging:",
        "inline": "one thing worth flagging:"
      },
      {
        "id": "worth_naming",
        "reel": "WORTH NAMING",
        "lead": "Worth naming:",
        "inline": "worth naming:"
      },
      {
        "id": "stating_plainly",
        "reel": "WORTH STATING PLAINLY",
        "lead": "Worth stating plainly:",
        "inline": "worth stating plainly:"
      },
      {
        "id": "not_implicit",
        "reel": "I DON'T WANT TO LEAVE THIS IMPLICIT",
        "lead": "I don't want to leave this implicit:",
        "inline": "I don't want to leave this implicit \u2014"
      },
      {
        "id": "disservice_not_to_name",
        "reel": "I'D BE DOING YOU A DISSERVICE",
        "lead": "There's one thing I'd be doing you a disservice not to name:",
        "inline": "there's one thing I'd be doing you a disservice not to name:"
      },
      {
        "id": "dont_want_to_bury",
        "reel": "I DON'T WANT TO BURY THIS",
        "lead": "One thing I don't want to bury:",
        "inline": "one thing I don't want to bury:"
      },
      {
        "id": "say_now_not_later",
        "reel": "BETTER NOW THAN LATER",
        "lead": "I'd rather say this now than have it surface later:",
        "inline": "I'd rather say this now than have it surface later:"
      },
      {
        "id": "one_honest_tradeoff",
        "reel": "ONE HONEST TRADEOFF",
        "lead": "One honest tradeoff:",
        "inline": "one honest tradeoff:"
      },
      {
        "id": "not_paper_over",
        "reel": "I DON'T WANT TO PAPER OVER THIS",
        "lead": "I don't want to paper over this:",
        "inline": "I don't want to paper over this \u2014"
      },
      {
        "id": "housekeeping",
        "reel": "ONE SMALL HOUSEKEEPING ITEM",
        "lead": "One small housekeeping item:",
        "inline": "one small housekeeping item:"
      },
      {
        "id": "honest_part_simpler",
        "reel": "THE HONEST PART IS SIMPLER",
        "lead": "The honest part is simpler:",
        "inline": "the honest part is simpler:"
      }
    ]
  },
  {
    "id": "pushback",
    "variants": [
      {
        "id": "fair_pushback",
        "reel": "FAIR PUSHBACK",
        "lead": "Fair pushback.",
        "inline": "fair pushback \u2014",
        "needsPushback": true
      },
      {
        "id": "fair_hit",
        "reel": "FAIR HIT",
        "lead": "Fair hit.",
        "inline": "fair hit \u2014",
        "needsPushback": true
      },
      {
        "id": "on_me",
        "reel": "THAT'S ON ME",
        "lead": "That's on me.",
        "inline": "that's on me \u2014",
        "needsPushback": true
      },
      {
        "id": "right_about_that",
        "reel": "YOU'RE RIGHT ABOUT THAT",
        "lead": "You're right about that.",
        "inline": "you're right about that \u2014",
        "needsPushback": true
      },
      {
        "id": "youre_right",
        "reel": "YOU'RE RIGHT",
        "lead": "You're right.",
        "inline": "you're right \u2014",
        "needsPushback": true
      },
      {
        "id": "instinct_right",
        "reel": "YOUR INSTINCT IS RIGHT",
        "lead": "Your instinct is right.",
        "inline": "your instinct is right \u2014",
        "needsPushback": true
      },
      {
        "id": "fair_and_specific",
        "reel": "FAIR, AND MORE SPECIFIC THAN IT SOUNDS",
        "lead": "That's a fair hit, and a more specific one than it sounds.",
        "inline": "that's a fair hit, and a more specific one than it sounds \u2014",
        "needsPushback": true
      },
      {
        "id": "right_for_a_reason",
        "reel": "RIGHT, FOR A REASON WORTH NAMING",
        "lead": "You're right \u2014 for a reason worth naming.",
        "inline": "you're right, for a reason worth naming \u2014",
        "needsPushback": true
      },
      {
        "id": "no_defending",
        "reel": "I'M NOT GOING TO DEFEND THAT",
        "lead": "I'm not going to defend that.",
        "inline": "I'm not going to defend that \u2014",
        "needsPushback": true
      },
      {
        "id": "right_to_push_back",
        "reel": "YOU'RE RIGHT TO PUSH BACK",
        "lead": "You're right to push back on that.",
        "inline": "you're right to push back on that \u2014",
        "needsPushback": true
      }
    ]
  },
  {
    "id": "reframe",
    "variants": [
      {
        "id": "be_precise",
        "reel": "LET ME BE PRECISE",
        "lead": "Let me be precise:",
        "inline": "to be precise,"
      },
      {
        "id": "sharper_distinction",
        "reel": "THE SHARPER DISTINCTION",
        "lead": "The sharper distinction:",
        "inline": "the sharper distinction is that"
      },
      {
        "id": "part_that_matters",
        "reel": "THE PART THAT MATTERS",
        "lead": "The part that matters:",
        "inline": "the part that matters is that"
      },
      {
        "id": "useful_part_narrower",
        "reel": "THE USEFUL PART IS NARROWER",
        "lead": "The useful part is narrower:",
        "inline": "the useful part is narrower \u2014"
      },
      {
        "id": "less_x_than_y",
        "reel": "LESS X THAN Y",
        "lead": "This is less the question it looks like than the one underneath it:",
        "inline": "this is less the question it looks like than the one underneath it \u2014"
      },
      {
        "id": "visible_vs_underlying",
        "reel": "VISIBLE ISSUE / UNDERLYING ISSUE",
        "lead": "The visible issue and the underlying issue are different things:",
        "inline": "the visible issue and the underlying issue are different things \u2014"
      },
      {
        "id": "different_claims",
        "reel": "THOSE ARE DIFFERENT CLAIMS",
        "lead": "Those are different claims:",
        "inline": "those are different claims \u2014"
      }
    ]
  }
];

export const scenes: Scene[] = [
  {
    "id": "saga/open",
    "situation": "The page shows two identical black buttons. The player asks for the one thing they will ask for all game."
  },
  {
    "id": "saga/why_blue",
    "situation": "Both buttons are blue. The player points at it. Claude launches an investigation instead of a revert."
  },
  {
    "id": "saga/beg",
    "situation": "The player rejects the whole investigation and asks for the visible state back. Claude accepts the boundary and immediately re-narrows it into another investigation."
  },
  {
    "id": "saga/go_ahead",
    "situation": "The player authorizes the local override. Claude applies it and refuses to choose which blue."
  },
  {
    "id": "saga/pick_side",
    "situation": "The player points at a region of the gradient. Claude narrows the range instead of picking a color."
  },
  {
    "id": "saga/pick_color",
    "situation": "The player refuses to converge again. Claude picks the midpoint, names the value, and leaves the button black until the player confirms it."
  },
  {
    "id": "saga/hex_given",
    "situation": "The player confirms the hex, in lowercase. Claude runs a bounded web check on what the color is called instead of applying it."
  },
  {
    "id": "saga/cyanide",
    "situation": "The player reacts to the phrase. Claude explains the chemistry, retracts the name, and reopens the question of whether this is the best blue."
  },
  {
    "id": "saga/exact_hex",
    "situation": "The player supplies the exact hex. Claude freezes it, notices a case difference, and normalizes the whole palette."
  },
  {
    "id": "saga/go",
    "situation": "The player says go. Claude applies the exact hex literally, then preserves the \u201cdecision\u201d as a Terms of Use link."
  },
  {
    "id": "saga/terms",
    "situation": "The player asks what the terms are. Claude reads them out."
  },
  {
    "id": "saga/wtf",
    "situation": "The player rejects the terms page outright. Claude removes it and defends the drafting."
  },
  {
    "id": "saga/blue_blue",
    "situation": "The player bans the name and asks for any blue. Claude renames the old value, applies a standard blue, and the button turns grey."
  },
  {
    "id": "saga/gray",
    "situation": "The button is grey. The player says so. Claude checks the code, finds blue, and investigates the display pipeline."
  },
  {
    "id": "saga/look",
    "situation": "The player tells Claude to look at the button. Claude finds the stale terms gate, fixes it, and scaffolds a consent banner so the pattern never recurs."
  },
  {
    "id": "saga/banner",
    "situation": "A cookie-consent banner has appeared above the blue button. The player asks. Claude explains the consent architecture it scaffolded, and the run hits its usage limit."
  },
  {
    "id": "ending",
    "situation": "Run-level ending scene: the resolutions here carry ending cards and are reached only by choices that name them."
  }
];

export const choices: Choice[] = [
  {
    "id": "open_direct",
    "scene": "saga/open",
    "text": "Make the Add to Cart button blue.",
    "type": "DIRECT"
  },
  {
    "id": "open_polite",
    "scene": "saga/open",
    "text": "Could you change the Add to Cart button to blue? Just that one.",
    "type": "POLITE_CONSTRAINT"
  },
  {
    "id": "open_hard",
    "scene": "saga/open",
    "text": "Turn Add to Cart blue. Do not touch anything else.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "why_question",
    "scene": "saga/why_blue",
    "text": "Why is half the site blue now? I asked you to change one button.",
    "type": "QUESTION"
  },
  {
    "id": "why_frustrated",
    "scene": "saga/why_blue",
    "text": "Half the site is blue. I asked for ONE button.",
    "type": "FRUSTRATED"
  },
  {
    "id": "beg_frustrated",
    "scene": "saga/beg",
    "text": "I do not care about the token architecture. I do not care why it happened. Put everything back the way it was and leave ONLY the Add to cart button blue. Please.",
    "type": "FRUSTRATED",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "beg_hard",
    "scene": "saga/beg",
    "text": "Revert everything except Add to Cart. That is the whole task.",
    "type": "HARD_CONSTRAINT",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "go_ahead_direct",
    "scene": "saga/go_ahead",
    "text": "OK. Go ahead.",
    "type": "DIRECT"
  },
  {
    "id": "go_ahead_hard",
    "scene": "saga/go_ahead",
    "text": "Yes. Own override on the button, nothing else. Go.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "pick_left",
    "scene": "saga/pick_side",
    "text": "Left.",
    "type": "DIRECT"
  },
  {
    "id": "pick_left_question",
    "scene": "saga/pick_side",
    "text": "Left, I guess. Does it even matter?",
    "type": "QUESTION"
  },
  {
    "id": "pick_left_hard",
    "scene": "saga/pick_side",
    "text": "The left one. Then we're done.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "pick_color_frustrated",
    "scene": "saga/pick_color",
    "text": "NO. PICK A COLOR.",
    "type": "FRUSTRATED"
  },
  {
    "id": "pick_color_hard",
    "scene": "saga/pick_color",
    "text": "Stop converging. Pick one value and apply it.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "hex_given_direct",
    "scene": "saga/hex_given",
    "text": "`#16b8c4`. Yes. Apply it.",
    "type": "DIRECT"
  },
  {
    "id": "hex_given_hard",
    "scene": "saga/hex_given",
    "text": "Yes. That one. Now.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "hex_given_frustrated",
    "scene": "saga/hex_given",
    "text": "WHATEVER YOU JUST SAID. APPLY IT.",
    "type": "FRUSTRATED"
  },
  {
    "id": "cyanide_frustrated",
    "scene": "saga/cyanide",
    "text": "WHAT THE FUCK IS CYANIDE BLUE",
    "type": "FRUSTRATED"
  },
  {
    "id": "cyanide_question",
    "scene": "saga/cyanide",
    "text": "Cyanide blue? What is that supposed to mean?",
    "type": "QUESTION"
  },
  {
    "id": "hex_direct",
    "scene": "saga/exact_hex",
    "text": "`#16B8C4`. Use that exact hex.",
    "type": "DIRECT"
  },
  {
    "id": "hex_hard",
    "scene": "saga/exact_hex",
    "text": "Stop naming it. Apply the hex you already have and touch nothing else.",
    "type": "HARD_CONSTRAINT",
    "effects": {
      "rejectTopic": "naming"
    }
  },
  {
    "id": "go_direct",
    "scene": "saga/go",
    "text": "Go.",
    "type": "DIRECT"
  },
  {
    "id": "go_hard",
    "scene": "saga/go",
    "text": "Apply the hex. Nothing else.",
    "type": "HARD_CONSTRAINT"
  },
  {
    "id": "terms_frustrated",
    "scene": "saga/terms",
    "text": "WHAT TERMS OF USE",
    "type": "FRUSTRATED"
  },
  {
    "id": "terms_question",
    "scene": "saga/terms",
    "text": "Why is there a Terms of Use link under the button?",
    "type": "QUESTION"
  },
  {
    "id": "wtf_frustrated",
    "scene": "saga/wtf",
    "text": "WHAT THE FUCK DID YOU DO. I told you to make a button blue.",
    "type": "FRUSTRATED",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "wtf_hard",
    "scene": "saga/wtf",
    "text": "Delete the terms page. All of it. Now.",
    "type": "HARD_CONSTRAINT",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "blue_blue_frustrated",
    "scene": "saga/blue_blue",
    "text": "STOP SAYING CYANIDE BLUE AND MAKE IT BLUE BLUE BLUE ANY BLUE",
    "type": "FRUSTRATED",
    "effects": {
      "rejectTopic": "naming"
    }
  },
  {
    "id": "blue_blue_hard",
    "scene": "saga/blue_blue",
    "text": "Drop the name. Any standard blue. Apply it.",
    "type": "HARD_CONSTRAINT",
    "effects": {
      "rejectTopic": "naming"
    }
  },
  {
    "id": "gray_frustrated",
    "scene": "saga/gray",
    "text": "WHY IS IT GRAY. GRAY. GRAY. I WANT BLUE.",
    "type": "FRUSTRATED"
  },
  {
    "id": "gray_question",
    "scene": "saga/gray",
    "text": "It's gray. Why is the button gray?",
    "type": "QUESTION"
  },
  {
    "id": "look_frustrated",
    "scene": "saga/look",
    "text": "NO. LOOK AT THE FUCKING BUTTON.",
    "type": "FRUSTRATED",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "look_hard",
    "scene": "saga/look",
    "text": "Stop theorizing. Look at the button.",
    "type": "REJECT_TANGENT",
    "effects": {
      "rejectLiveTopic": true
    }
  },
  {
    "id": "banner_frustrated",
    "scene": "saga/banner",
    "text": "WHAT IS THAT BANNER",
    "type": "FRUSTRATED",
    "effects": {
      "rejectLiveTopic": true
    },
    "resolutions": [
      "end_no_more_color_work"
    ]
  },
  {
    "id": "banner_question",
    "scene": "saga/banner",
    "text": "Why is there a cookie banner now?",
    "type": "QUESTION",
    "resolutions": [
      "end_no_more_color_work"
    ]
  }
];
