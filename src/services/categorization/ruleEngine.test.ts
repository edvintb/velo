import { categorizeByFiveSplitRules, categorizeByThreeSplitRules, buildThreeSplitConfig, type CategorizationInput } from "./ruleEngine";

function input(overrides: Partial<CategorizationInput> = {}): CategorizationInput {
  return {
    labelIds: [],
    fromAddress: null,
    listUnsubscribe: null,
    ...overrides,
  };
}

describe("categorizeByFiveSplitRules", () => {
  describe("Layer 1: Gmail CATEGORY_* labels", () => {
    it("maps CATEGORY_PROMOTIONS to Promotions", () => {
      expect(categorizeByFiveSplitRules(input({ labelIds: ["INBOX", "CATEGORY_PROMOTIONS"] }))).toBe("Promotions");
    });

    it("maps CATEGORY_SOCIAL to Social", () => {
      expect(categorizeByFiveSplitRules(input({ labelIds: ["INBOX", "CATEGORY_SOCIAL"] }))).toBe("Social");
    });

    it("maps CATEGORY_UPDATES to Updates", () => {
      expect(categorizeByFiveSplitRules(input({ labelIds: ["INBOX", "CATEGORY_UPDATES"] }))).toBe("Updates");
    });

    it("maps CATEGORY_FORUMS to Primary", () => {
      expect(categorizeByFiveSplitRules(input({ labelIds: ["INBOX", "CATEGORY_FORUMS"] }))).toBe("Primary");
    });

    it("maps CATEGORY_PERSONAL to Primary", () => {
      expect(categorizeByFiveSplitRules(input({ labelIds: ["INBOX", "CATEGORY_PERSONAL"] }))).toBe("Primary");
    });

    it("Gmail labels take priority over domain heuristics", () => {
      expect(categorizeByFiveSplitRules(input({
        labelIds: ["CATEGORY_UPDATES"],
        fromAddress: "marketing@substack.com",
      }))).toBe("Updates");
    });
  });

  describe("Layer 2: Domain heuristics", () => {
    it("classifies social network domains as Social", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "notifications@facebookmail.com" }))).toBe("Social");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "info@linkedin.com" }))).toBe("Social");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "notify@twitter.com" }))).toBe("Social");
    });

    it("classifies newsletter platform domains as Newsletters", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "author@substack.com" }))).toBe("Newsletters");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "campaign@mailchimp.com" }))).toBe("Newsletters");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "sender@beehiiv.com" }))).toBe("Newsletters");
    });

    it("classifies promotional prefixes as Promotions", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "marketing@example.com" }))).toBe("Promotions");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "promo@shop.com" }))).toBe("Promotions");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "deals@store.com" }))).toBe("Promotions");
    });

    it("classifies update prefixes as Updates", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "noreply@github.com" }))).toBe("Updates");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "notifications@bank.com" }))).toBe("Updates");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "no-reply@service.com" }))).toBe("Updates");
      expect(categorizeByFiveSplitRules(input({ fromAddress: "security@company.com" }))).toBe("Updates");
    });

    it("social domain takes priority over update prefix", () => {
      // "notifications@facebookmail.com" - domain wins over prefix
      expect(categorizeByFiveSplitRules(input({ fromAddress: "notifications@facebookmail.com" }))).toBe("Social");
    });
  });

  describe("Layer 3: List-Unsubscribe header", () => {
    it("classifies list-unsubscribe mail as Promotions by default", () => {
      expect(categorizeByFiveSplitRules(input({
        fromAddress: "someone@randomcompany.com",
        listUnsubscribe: "<mailto:unsub@example.com>",
      }))).toBe("Promotions");
    });

    it("classifies list-unsubscribe from newsletter domains as Newsletters", () => {
      expect(categorizeByFiveSplitRules(input({
        fromAddress: "author@substack.com",
        listUnsubscribe: "<https://substack.com/unsub>",
      }))).toBe("Newsletters");
    });

    it("list-unsubscribe with no from address defaults to Promotions", () => {
      expect(categorizeByFiveSplitRules(input({
        listUnsubscribe: "<mailto:unsub@example.com>",
      }))).toBe("Promotions");
    });
  });

  describe("Layer 4: Default", () => {
    it("returns Primary for regular person-to-person email", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "alice@gmail.com" }))).toBe("Primary");
    });

    it("returns Primary when no signals present", () => {
      expect(categorizeByFiveSplitRules(input())).toBe("Primary");
    });

    it("returns Primary for unknown domains with normal local part", () => {
      expect(categorizeByFiveSplitRules(input({ fromAddress: "john.doe@company.com" }))).toBe("Primary");
    });
  });

  describe("Priority ordering", () => {
    it("Gmail label > domain heuristic > list-unsubscribe > default", () => {
      // All signals present but Gmail label wins
      const result = categorizeByFiveSplitRules(input({
        labelIds: ["CATEGORY_SOCIAL"],
        fromAddress: "marketing@substack.com",
        listUnsubscribe: "<mailto:unsub@example.com>",
      }));
      expect(result).toBe("Social");
    });

    it("domain heuristic > list-unsubscribe", () => {
      // Social domain + unsubscribe header → domain wins
      const result = categorizeByFiveSplitRules(input({
        fromAddress: "user@linkedin.com",
        listUnsubscribe: "<mailto:unsub@linkedin.com>",
      }));
      expect(result).toBe("Social");
    });
  });
});

describe("categorizeByThreeSplitRules", () => {
  describe("with default config (no feed patterns)", () => {
    it("returns Primary for regular person-to-person email", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "alice@gmail.com" }))).toBe("Primary");
    });

    it("returns Primary when no signals present", () => {
      expect(categorizeByThreeSplitRules(input())).toBe("Primary");
    });

    it("returns Primary for unknown domains with normal local part", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "john.doe@company.com" }))).toBe("Primary");
    });

    it("does not classify any sender as Feeds without custom feed patterns", () => {
      // Without feed patterns, only List-Unsubscribe triggers Feeds
      expect(categorizeByThreeSplitRules(input({ fromAddress: "digest@economist.com" }))).toBe("Primary");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "author@substack.com" }))).toBe("Primary");
    });
  });

  describe("default notification patterns", () => {
    it("classifies transactional prefixes as Notifications", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "noreply@github.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "no-reply@bank.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "notifications@service.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "notification@service.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "billing@company.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "security@provider.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "verify@auth.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "confirm@signup.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "alerts@monitoring.com" }))).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "alert@monitoring.com" }))).toBe("Notifications");
    });

    it("List-Unsubscribe takes priority over notification patterns", () => {
      // noreply@ would match notification, but List-Unsubscribe wins → Feeds
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "noreply@someservice.com",
        listUnsubscribe: "<mailto:unsub@someservice.com>",
      }))).toBe("Feeds");
    });
  });

  describe("List-Unsubscribe → Feeds", () => {
    it("classifies emails with List-Unsubscribe as Feeds", () => {
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "someone@randomcompany.com",
        listUnsubscribe: "<mailto:unsub@example.com>",
      }))).toBe("Feeds");
    });

    it("classifies List-Unsubscribe with no from address as Feeds", () => {
      expect(categorizeByThreeSplitRules(input({
        listUnsubscribe: "<https://example.com/unsub>",
      }))).toBe("Feeds");
    });
  });

  describe("ignores Gmail labels", () => {
    it("does not use CATEGORY_* labels for classification", () => {
      expect(categorizeByThreeSplitRules(input({
        labelIds: ["CATEGORY_PROMOTIONS"],
        fromAddress: "alice@gmail.com",
      }))).toBe("Primary");

      expect(categorizeByThreeSplitRules(input({
        labelIds: ["CATEGORY_SOCIAL"],
        fromAddress: "john@company.com",
      }))).toBe("Primary");
    });
  });

  describe("custom config", () => {
    const config = buildThreeSplitConfig(
      ["@economist\\.com$", "@.*\\.a16z\\.com$", "@bloomberg\\.com$"],
      ["^noreply@", "^no-reply@", "^billing@"],
    );

    it("feed patterns match sender addresses", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "digest@economist.com" }), config)).toBe("Feeds");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "weekly@future.a16z.com" }), config)).toBe("Feeds");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "matt@bloomberg.com" }), config)).toBe("Feeds");
    });

    it("feed patterns take priority over notification patterns", () => {
      // noreply@ matches notification, but @economist.com matches feed first
      expect(categorizeByThreeSplitRules(input({ fromAddress: "noreply@economist.com" }), config)).toBe("Feeds");
    });

    it("notification patterns still work with custom config", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "noreply@github.com" }), config)).toBe("Notifications");
      expect(categorizeByThreeSplitRules(input({ fromAddress: "billing@company.com" }), config)).toBe("Notifications");
    });

    it("custom config does not include default notification patterns it omitted", () => {
      // "security@" is in defaults but not in this custom config
      expect(categorizeByThreeSplitRules(input({ fromAddress: "security@provider.com" }), config)).toBe("Primary");
    });

    it("non-matching senders fall through to Primary", () => {
      expect(categorizeByThreeSplitRules(input({ fromAddress: "alice@gmail.com" }), config)).toBe("Primary");
    });
  });

  describe("priority ordering", () => {
    const config = buildThreeSplitConfig(
      ["@economist\\.com$"],
      ["^billing@"],
    );

    it("feed pattern > List-Unsubscribe > notification pattern > default", () => {
      // Feed pattern wins over List-Unsubscribe + notification pattern
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "billing@economist.com",
        listUnsubscribe: "<mailto:unsub@economist.com>",
      }), config)).toBe("Feeds");

      // List-Unsubscribe wins over notification pattern
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "billing@random.com",
        listUnsubscribe: "<mailto:unsub@random.com>",
      }), config)).toBe("Feeds");

      // Notification pattern wins over default
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "billing@random.com",
      }), config)).toBe("Notifications");

      // Default when nothing matches
      expect(categorizeByThreeSplitRules(input({
        fromAddress: "hello@unknown.com",
      }), config)).toBe("Primary");
    });
  });
});
