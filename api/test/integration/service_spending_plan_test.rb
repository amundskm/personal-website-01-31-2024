require "test_helper"

class ServiceSpendingPlanTest < ActionDispatch::IntegrationTest
  setup do
    @previous = ENV["SERVICE_TOKEN"]
    ENV["SERVICE_TOKEN"] = "s3cret"
    SpendingPlan.instance.update!(categories: [{ "_key" => "food", "name" => "Food", "merchantPatterns" => [] }])
  end

  teardown { ENV["SERVICE_TOKEN"] = @previous }

  def service = { "Authorization" => "Bearer s3cret" }

  test "returns the plan to the finances Lambda" do
    get "/service/spending-plan", headers: service
    assert_response :success
    assert_equal "food", response.parsed_body["categories"].first["key"]
  end

  test "remembers merchant patterns" do
    post "/service/spending-plan/rules", params: { rules: [{ categoryKey: "food", pattern: "acme grocery" }] }, headers: service, as: :json
    assert_response :no_content
    assert_equal ["ACME GROCERY"], SpendingPlan.instance.categories.first["merchantPatterns"]
  end

  test "rejects a wrong or missing token" do
    get "/service/spending-plan", headers: { "Authorization" => "Bearer nope" }
    assert_response :unauthorized
    get "/service/spending-plan"
    assert_response :unauthorized
  end

  test "is closed when no token is configured" do
    ENV["SERVICE_TOKEN"] = nil
    get "/service/spending-plan", headers: { "Authorization" => "Bearer " }
    assert_response :unauthorized
  end
end
