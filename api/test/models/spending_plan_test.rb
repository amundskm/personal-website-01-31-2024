require "test_helper"

class SpendingPlanTest < ActiveSupport::TestCase
  setup do
    SpendingPlan.instance.update!(categories: [
      { "_key" => "food", "name" => "Food", "monthlyBudget" => 500, "merchantPatterns" => ["ACME GROCERY"] },
      { "_key" => "fun", "name" => "Fun", "monthlyBudget" => 100, "merchantPatterns" => ["widgetmart "] },
      { "_key" => "misc", "name" => "Misc", "monthlyBudget" => 50 },
    ])
  end

  def patterns = SpendingPlan.instance.categories.to_h { |c| [c["_key"], c["merchantPatterns"]] }

  test "adds a pattern, moving it out of other categories" do
    SpendingPlan.remember_rules!([{ "categoryKey" => "food", "pattern" => " Widgetmart" }])
    assert_equal({ "food" => ["ACME GROCERY", "WIDGETMART"], "fun" => [], "misc" => nil }, patterns)
  end

  test "creates the list for a category that had none" do
    SpendingPlan.remember_rules!([{ "categoryKey" => "misc", "pattern" => "gizmo depot" }])
    assert_equal ["GIZMO DEPOT"], patterns["misc"]
  end

  test "ignores duplicates, unknown categories and bad patterns" do
    SpendingPlan.remember_rules!([
      { "categoryKey" => "food", "pattern" => "acme grocery" },
      { "categoryKey" => "nope", "pattern" => "FUEL STOP" },
      { "categoryKey" => "food", "pattern" => "AB" },
      { "categoryKey" => "food", "pattern" => 42 },
      { "categoryKey" => "food", "pattern" => "X" * 81 },
    ])
    assert_equal ["ACME GROCERY"], patterns["food"]
    assert_equal ["widgetmart "], patterns["fun"]
  end

  test "as_plan matches the old query shape" do
    plan = SpendingPlan.instance.as_plan
    assert_equal({ "key" => "food", "name" => "Food", "monthlyBudget" => 500, "merchantPatterns" => ["ACME GROCERY"],
                   "activeMonths" => nil, "plannedPurchases" => nil }, plan["categories"].first)
    assert_equal [], plan["stages"]
  end
end
