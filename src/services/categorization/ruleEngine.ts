import type { FiveSplitCategory, ThreeSplitCategory } from "@/services/db/threadCategories";

export interface CategorizationInput {
  labelIds: string[];
  fromAddress: string | null;
  listUnsubscribe: string | null;
}

/** Exact sender addresses or domains forced to a specific category. Checked first. */
const SENDER_OVERRIDES: Map<string, FiveSplitCategory> = new Map([
  // Newsletters miscategorized as Updates
  ["economist.com", "Newsletters"],
  ["e.economist.com", "Newsletters"],
  ["a16z.com", "Newsletters"],
  ["future.a16z.com", "Newsletters"],
  ["bloomberg.com", "Newsletters"],       // Matt Levine / Money Stuff
  ["mail.bloombergbusiness.com", "Newsletters"],
]);

const SOCIAL_DOMAINS = new Set([
  "facebookmail.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "reddit.com",
  "snapchat.com",
  "tumblr.com",
  "nextdoor.com",
  "meetup.com",
  "discord.com",
  "mastodon.social",
]);

const NEWSLETTER_DOMAINS = new Set([
  "substack.com",
  "mailchimp.com",
  "convertkit.com",
  "beehiiv.com",
  "buttondown.email",
  "revue.email",
  "ghost.io",
  "tinyletter.com",
  "sendinblue.com",
  "mailerlite.com",
  "campaignmonitor.com",
  "constantcontact.com",
  "getresponse.com",
  "aweber.com",
]);

const PROMO_PREFIXES = new Set([
  "marketing",
  "promo",
  "promotions",
  "deals",
  "offers",
  "sales",
  "shop",
  "store",
  "newsletter",
  "info",
  "hello",
]);

const UPDATE_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "support",
  "billing",
  "account",
  "security",
  "verify",
  "confirm",
]);

function getDomain(email: string): string | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return null;
  return email.slice(atIdx + 1).toLowerCase();
}

function getLocalPart(email: string): string | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return null;
  return email.slice(0, atIdx).toLowerCase();
}

/**
 * Categorize a thread using deterministic rules. No I/O, fully testable.
 *
 * Priority layers:
 * 1. Gmail CATEGORY_* labels
 * 2. Domain heuristics (social domains, newsletter platforms, promo prefixes)
 * 3. List-Unsubscribe header presence
 * 4. Default → Primary
 */
export function categorizeByRules(input: CategorizationInput): FiveSplitCategory {
  // Layer 0: Sender-specific overrides (highest priority)
  if (input.fromAddress) {
    const domain = getDomain(input.fromAddress);
    const addr = input.fromAddress.toLowerCase();
    if (SENDER_OVERRIDES.has(addr)) return SENDER_OVERRIDES.get(addr)!;
    if (domain && SENDER_OVERRIDES.has(domain)) return SENDER_OVERRIDES.get(domain)!;
  }

  // Layer 1: Gmail category labels
  for (const label of input.labelIds) {
    switch (label) {
      case "CATEGORY_PROMOTIONS":
        return "Promotions";
      case "CATEGORY_SOCIAL":
        return "Social";
      case "CATEGORY_UPDATES":
        return "Updates";
      case "CATEGORY_FORUMS":
        // Forums map to Primary (closest match)
        return "Primary";
      case "CATEGORY_PERSONAL":
        return "Primary";
    }
  }

  // Layer 2: Domain & address heuristics
  if (input.fromAddress) {
    const domain = getDomain(input.fromAddress);
    const localPart = getLocalPart(input.fromAddress);

    if (domain) {
      // Social networks
      if (SOCIAL_DOMAINS.has(domain)) return "Social";

      // Newsletter platforms
      if (NEWSLETTER_DOMAINS.has(domain)) return "Newsletters";
    }

    if (localPart) {
      // Promotional prefixes
      if (PROMO_PREFIXES.has(localPart)) return "Promotions";

      // Update/notification prefixes
      if (UPDATE_PREFIXES.has(localPart)) return "Updates";
    }
  }

  // Layer 3: List-Unsubscribe header
  if (input.listUnsubscribe) {
    // If from a newsletter-ish domain, classify as newsletter
    if (input.fromAddress) {
      const domain = getDomain(input.fromAddress);
      if (domain && NEWSLETTER_DOMAINS.has(domain)) return "Newsletters";
    }
    // Generic unsubscribable mail → Promotions
    return "Promotions";
  }

  // Layer 4: Default
  return "Primary";
}

// ── 3-Split (3-category system) ───────────────────────────────────────

const NOTIFICATION_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "billing",
  "account",
  "security",
  "verify",
  "confirm",
]);

const THREE_SPLIT_FEED_OVERRIDES = new Set([
  "economist.com",
  "e.economist.com",
  "a16z.com",
  "future.a16z.com",
  "bloomberg.com",
  "mail.bloombergbusiness.com",
]);

/**
 * 3-Split categorization — does NOT use Gmail CATEGORY_* labels.
 * Pure heuristic-based: sender overrides, prefixes, headers, domains.
 *
 * 1. Sender feed overrides (known newsletters)
 * 2. Transactional/notification prefixes → Notifications
 * 3. List-Unsubscribe or newsletter/promo/social domain/prefix → Feeds
 * 4. Default → Primary
 */
export function categorizeByThreeSplitRules(input: CategorizationInput): ThreeSplitCategory {
  const domain = input.fromAddress ? getDomain(input.fromAddress) : null;
  const localPart = input.fromAddress ? getLocalPart(input.fromAddress) : null;

  // Layer 0: Sender-specific feed overrides
  if (domain && THREE_SPLIT_FEED_OVERRIDES.has(domain)) return "Feeds";
  if (input.fromAddress && THREE_SPLIT_FEED_OVERRIDES.has(input.fromAddress.toLowerCase())) return "Feeds";

  // Layer 1: Notification prefixes (transactional)
  if (localPart && NOTIFICATION_PREFIXES.has(localPart)) return "Notifications";

  // Layer 2: List-Unsubscribe → Feeds
  if (input.listUnsubscribe) return "Feeds";

  // Layer 3: Known feed domains/prefixes
  if (domain && (NEWSLETTER_DOMAINS.has(domain) || SOCIAL_DOMAINS.has(domain))) return "Feeds";
  if (localPart && PROMO_PREFIXES.has(localPart)) return "Feeds";

  // Layer 4: Default
  return "Primary";
}
