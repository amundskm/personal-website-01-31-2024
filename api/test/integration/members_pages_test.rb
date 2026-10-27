require "test_helper"

class MembersPagesTest < ActionDispatch::IntegrationTest
  include CognitoTestHelper

  setup do
    MemberPage.create!(title: "Trip", slug: "trip", audiences: ["neia-boiz"], sections: [{ "_type" => "richTextBlock", "_key" => "a" }])
    MemberPage.create!(title: "Budget notes", slug: "budget", audiences: ["wife"])
  end

  test "lists only pages shared with the caller" do
    get "/members/pages", headers: bearer(access_token(groups: ["neia-boiz"]))
    assert_response :success
    assert_equal ["trip"], response.parsed_body.map { |p| p["slug"] }
    assert_equal "private, no-store", response.headers["Cache-Control"]
  end

  test "a page not shared with the caller is a 404" do
    get "/members/pages/budget", headers: bearer(access_token(groups: ["neia-boiz"]))
    assert_response :not_found
  end

  test "admins can open any page" do
    get "/members/pages/budget", headers: bearer(access_token(groups: ["admin"]))
    assert_response :success
    assert_equal [], response.parsed_body["sections"]
  end

  test "accounts with no groups are forbidden" do
    get "/members/pages", headers: bearer(access_token)
    assert_response :forbidden
  end

  test "rejects missing, expired, ID and other-app tokens" do
    get "/members/pages"
    assert_response :unauthorized

    [
      access_token(groups: ["admin"], exp: 1.minute.ago.to_i),
      access_token(groups: ["admin"], token_use: "id"),
      access_token(groups: ["admin"], client_id: "other-app"),
      access_token(groups: ["admin"], iss: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Other"),
    ].each do |token|
      get "/members/pages", headers: bearer(token)
      assert_response :unauthorized
    end
  end

  test "rejects tokens signed with another key" do
    forged = JWT.encode({ "token_use" => "access", "cognito:groups" => ["admin"] }, OpenSSL::PKey::RSA.generate(2048), "RS256", kid: "test-key")
    get "/members/pages", headers: bearer(forged)
    assert_response :unauthorized
  end
end
