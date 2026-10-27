# Family budget: categories (with merchant patterns used to categorize card
# transactions) and stage targets. There is a single row. Only the finances
# Lambda reads it, through the service API.
class SpendingPlan < ApplicationRecord
  PATTERN_LENGTH = 3..80

  def self.instance
    first_or_create!
  end

  # The shape the finances Lambda expects (formerly SPENDING_PLAN_QUERY).
  def as_plan
    {
      "categories" => categories.map do |c|
        {
          "key" => c["_key"],
          "name" => c["name"],
          "monthlyBudget" => c["monthlyBudget"],
          "merchantPatterns" => c["merchantPatterns"],
          "activeMonths" => c["activeMonths"],
          "plannedPurchases" => c["plannedPurchases"]&.map { |p| p.slice("label", "month", "amount") },
        }
      end,
      "stages" => stages.map { |s| s.slice("label", "startDate", "monthlyTarget") },
    }
  end

  # Files each merchant pattern under its category, moving it out of any other
  # category that had it. Rules for unknown categories or with too short/long
  # patterns are ignored. Locks the row so concurrent uploads don't lose rules.
  def self.remember_rules!(rules)
    transaction do
      plan = lock.instance
      changed = false

      Array(rules).each do |rule|
        key = rule["categoryKey"]
        pattern = rule["pattern"]
        next unless key.is_a?(String) && pattern.is_a?(String)

        pattern = pattern.strip.upcase
        next unless PATTERN_LENGTH.cover?(pattern.length)

        target = plan.categories.find { |c| c["_key"] == key }
        next unless target

        plan.categories.each do |category|
          next if category.equal?(target)
          before = category["merchantPatterns"]&.length
          category["merchantPatterns"]&.reject! { |p| p.strip.upcase == pattern }
          changed ||= before != category["merchantPatterns"]&.length
        end

        target["merchantPatterns"] ||= []
        next if target["merchantPatterns"].any? { |p| p.strip.upcase == pattern }

        target["merchantPatterns"] << pattern
        changed = true
      end

      plan.save! if changed
    end
  end
end
