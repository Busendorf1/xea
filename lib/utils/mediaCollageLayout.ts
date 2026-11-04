export type MediaCollageMode =
  | "single"
  | "ratio_1_2"
  | "ratio_1_3"
  | "ratio_1_1_2"
  | "ratio_2_1_1_1"
  | "scroll_equal"
  | "scroll_asymmetric";

export interface MediaCollageCell {
  url: string;
  index: number;
  weight: number;
  /** Width percentage used when rendered inside a horizontal scroll strip */
  scrollWidthPercent: number;
  showMoreBadge: boolean;
  extraCount: number;
}

export interface MediaCollageDescriptor {
  mode: MediaCollageMode;
  isHorizontalScroll: boolean;
  ratioLabel:
    | "1:1"
    | "1:2"
    | "1:3"
    | "1:1:2"
    | "2:1:1:1"
    | "scroll-equal"
    | "scroll-1:2"
    | "scroll-2:1:1"
    | "scroll-2:1:1:1";
  visibleUrls: string[];
  extraCount: number;
  secondItemFlex: 2 | 3;
  cells: MediaCollageCell[];
}

/**
 * Deterministic 32-bit FNV-1a hash from media URLs so the same post always
 * selects the exact same layout across re-renders and across Web & Mobile,
 * while different posts in the feed naturally vary between Bento Grids and
 * Smooth Horizontal Scroll Strips.
 */
export function hashMediaSeed(mediaUrls: string[]): number {
  const raw = mediaUrls.join("|");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Pure, reusable layout resolver for X / Bluesky / Threads-style multi-media feeds.
 *
 * How it determines which layout & ratio to use:
 * 1. Content signals:
 *    - If a post has >4 media items or multiple videos (2+ videos), it automatically selects
 *      a smooth Horizontal Scroll Strip so all items can be swiped left-to-right without cropping.
 *    - If a 2-media bento post has a video or wide landscape (aspect ratio >= 1.35) in slot 2,
 *      it selects the wider 1:3 ratio instead of 1:2.
 * 2. Deterministic seed variety (FNV-1a hash of the media URLs):
 *    - For 2, 3, or 4 media items, the hash deterministically alternates posts between:
 *      a) Static Asymmetric Bento Grids (1:2, 1:3, 1:1:2, 2:1:1:1)
 *      b) Smooth Left-to-Right Horizontal Scroll Strips in either Equal Ratio (1:1:1...) or
 *         Asymmetric Ratio (1:2, 2:1:1, 2:1:1:1 card widths).
 */
export function resolveMediaCollageLayout(
  mediaUrls: string[],
  options?: {
    getAspectRatio?: (url: string) => number | undefined;
    isVideoUrl?: (url: string) => boolean;
  }
): MediaCollageDescriptor {
  const count = mediaUrls.length;

  if (count <= 1) {
    const singleUrls = mediaUrls.slice(0, 1);
    return {
      mode: "single",
      isHorizontalScroll: false,
      ratioLabel: "1:1",
      visibleUrls: singleUrls,
      extraCount: 0,
      secondItemFlex: 2,
      cells: singleUrls.map((url, index) => ({
        url,
        index,
        weight: 1,
        scrollWidthPercent: 100,
        showMoreBadge: false,
        extraCount: 0,
      })),
    };
  }

  const seed = hashMediaSeed(mediaUrls);
  const videoCount = mediaUrls.reduce((acc, url) => {
    const isVid = options?.isVideoUrl
      ? options.isVideoUrl(url)
      : /\.(mp4|webm|mov|avi|m3u8)$/i.test(url.split("?")[0]);
    return acc + (isVid ? 1 : 0);
  }, 0);

  // Decide whether this multi-media post should use Horizontal Left-to-Right Scroll
  // or a Bento Collage Grid:
  // - Posts with >4 items or 2+ videos always use horizontal scroll.
  // - Otherwise ~45% of 2, 3, and 4-item posts deterministically use horizontal scroll.
  const useHorizontalScroll =
    count > 4 || videoCount >= 2 || seed % 5 === 1 || seed % 5 === 3;

  if (useHorizontalScroll) {
    const useAsymmetricScroll = seed % 2 === 0;

    if (count === 2) {
      // 2 items horizontal scroll: either equal peek (74% : 74%) or 1:2 asymmetric (52% : 80%)
      const weights = useAsymmetricScroll ? [1, 2] : [1, 1];
      const widths = useAsymmetricScroll ? [52, 80] : [74, 74];
      return {
        mode: useAsymmetricScroll ? "scroll_asymmetric" : "scroll_equal",
        isHorizontalScroll: true,
        ratioLabel: useAsymmetricScroll ? "scroll-1:2" : "scroll-equal",
        visibleUrls: mediaUrls,
        extraCount: 0,
        secondItemFlex: 2,
        cells: mediaUrls.map((url, index) => ({
          url,
          index,
          weight: weights[index] || 1,
          scrollWidthPercent: widths[index] || 74,
          showMoreBadge: false,
          extraCount: 0,
        })),
      };
    }

    if (count === 3) {
      // 3 items horizontal scroll: either equal (68% each) or 2:1:1 asymmetric (78%, 52%, 52%)
      const weights = useAsymmetricScroll ? [2, 1, 1] : [1, 1, 1];
      const widths = useAsymmetricScroll ? [78, 52, 52] : [68, 68, 68];
      return {
        mode: useAsymmetricScroll ? "scroll_asymmetric" : "scroll_equal",
        isHorizontalScroll: true,
        ratioLabel: useAsymmetricScroll ? "scroll-2:1:1" : "scroll-equal",
        visibleUrls: mediaUrls,
        extraCount: 0,
        secondItemFlex: 2,
        cells: mediaUrls.map((url, index) => ({
          url,
          index,
          weight: weights[index] || 1,
          scrollWidthPercent: widths[index] || 68,
          showMoreBadge: false,
          extraCount: 0,
        })),
      };
    }

    // 4+ items horizontal scroll: all items scrollable left-to-right, either equal (66%) or 2:1:1:1 asymmetric (76%, 50%, 50%, 50%)
    return {
      mode: useAsymmetricScroll ? "scroll_asymmetric" : "scroll_equal",
      isHorizontalScroll: true,
      ratioLabel: useAsymmetricScroll ? "scroll-2:1:1:1" : "scroll-equal",
      visibleUrls: mediaUrls,
      extraCount: 0,
      secondItemFlex: 2,
      cells: mediaUrls.map((url, index) => ({
        url,
        index,
        weight: useAsymmetricScroll && index === 0 ? 2 : 1,
        scrollWidthPercent: useAsymmetricScroll ? (index === 0 ? 76 : 50) : 66,
        showMoreBadge: false,
        extraCount: 0,
      })),
    };
  }

  // Static Bento Collage Grids (for 2, 3, or 4 items)
  const visibleUrls = mediaUrls.slice(0, 4);
  const extraCount = count > 4 ? count - 4 : 0;

  if (count === 2) {
    const secondUrl = mediaUrls[1];
    const isSecondVideo = options?.isVideoUrl
      ? options.isVideoUrl(secondUrl)
      : /\.(mp4|webm|mov|avi|m3u8)$/i.test(secondUrl.split("?")[0]);
    const secondRatio = options?.getAspectRatio
      ? options.getAspectRatio(secondUrl)
      : undefined;
    const use1to3 = Boolean(
      isSecondVideo ||
        (secondRatio !== undefined && secondRatio >= 1.35) ||
        seed % 2 === 1
    );
    const secondWeight: 2 | 3 = use1to3 ? 3 : 2;

    return {
      mode: use1to3 ? "ratio_1_3" : "ratio_1_2",
      isHorizontalScroll: false,
      ratioLabel: use1to3 ? "1:3" : "1:2",
      visibleUrls,
      extraCount: 0,
      secondItemFlex: secondWeight,
      cells: [
        {
          url: visibleUrls[0],
          index: 0,
          weight: 1,
          scrollWidthPercent: 34,
          showMoreBadge: false,
          extraCount: 0,
        },
        {
          url: visibleUrls[1],
          index: 1,
          weight: secondWeight,
          scrollWidthPercent: 66,
          showMoreBadge: false,
          extraCount: 0,
        },
      ],
    };
  }

  if (count === 3) {
    return {
      mode: "ratio_1_1_2",
      isHorizontalScroll: false,
      ratioLabel: "1:1:2",
      visibleUrls,
      extraCount: 0,
      secondItemFlex: 2,
      cells: [
        {
          url: visibleUrls[0],
          index: 0,
          weight: 1,
          scrollWidthPercent: 50,
          showMoreBadge: false,
          extraCount: 0,
        },
        {
          url: visibleUrls[1],
          index: 1,
          weight: 1,
          scrollWidthPercent: 50,
          showMoreBadge: false,
          extraCount: 0,
        },
        {
          url: visibleUrls[2],
          index: 2,
          weight: 2,
          scrollWidthPercent: 58,
          showMoreBadge: false,
          extraCount: 0,
        },
      ],
    };
  }

  return {
    mode: "ratio_2_1_1_1",
    isHorizontalScroll: false,
    ratioLabel: "2:1:1:1",
    visibleUrls,
    extraCount,
    secondItemFlex: 2,
    cells: [
      {
        url: visibleUrls[0],
        index: 0,
        weight: 2,
        scrollWidthPercent: 60,
        showMoreBadge: false,
        extraCount: 0,
      },
      {
        url: visibleUrls[1],
        index: 1,
        weight: 1,
        scrollWidthPercent: 40,
        showMoreBadge: false,
        extraCount: 0,
      },
      {
        url: visibleUrls[2],
        index: 2,
        weight: 1,
        scrollWidthPercent: 40,
        showMoreBadge: false,
        extraCount: 0,
      },
      {
        url: visibleUrls[3],
        index: 3,
        weight: 1,
        scrollWidthPercent: 40,
        showMoreBadge: extraCount > 0,
        extraCount,
      },
    ],
  };
}
