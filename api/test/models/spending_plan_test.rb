require "test_helper"

class SpendingPlanTest < ActiveSupport::TestCase
  setup do
    SpendingPlan.instance.update!(categories: [
      { "_key" => "food", "name" => "Food", "monthlyBudget" => 500, "merchantPatterns" => ["KROGER"] },
      { "_key" => "fun", "name" => "Fun", "monthlyBudget" => 100, "merchantPatterns" => ["target "] },
      { "_key" => "misc", "name" => "Misc", "monthlyBudget" => 50 },
    ])
  end

  def patterns = SpendingPlan.instance.categories.to_h { |c| [c["_key"], c["merchantPatterns"]] }

  test "adds a pattern, moving it out of other categories" do
    SpendingPlan.remember_rules!([{ "categoryKey" => "food", "pattern" => " Target" }])
    assert_equal({ "food" => %w[KROGER TARGET], "fun" => [], "misc" => nil }, patterns)
  end

  test "creates the list for a category that had none" do
    SpendingPlan.remember_rules!([{ "categoryKey" => "misc", "pattern" => "amazon" }])
    assert_equal ["AMAZON"], patterns["misc"]
  end

  test "ignores duplicates, unknown categories and bad patterns" do
    SpendingPlan.remember_rules!([
      { "categoryKey" => "food", "pattern" => "kroger" },
      { "categoryKey" => "nope", "pattern" => "SHELL" },
      { "categoryKey" => "food", "pattern" => "AB" },
      { "categoryKey" => "food", "pattern" => 42 },
      { "categoryKey" => "food", "pattern" => "X" * 81 },
    ])
    assert_equal ["KROGER"], patterns["food"]
    assert_equal ["target "], patterns["fun"]
  end

  test "as_plan matches the old query shape" do
    plan = SpendingPlan.instance.as_plan
    assert_equal({ "key" => "food", "name" => "Food", "monthlyBudget" => 500, "merchantPatterns" => ["KROGER"],
                   "activeMonths" => nil, "plannedPurchases" => nil }, plan["categories"].first)
    assert_equal [], plan["stages"]
  end
end
