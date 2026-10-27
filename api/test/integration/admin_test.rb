require "test_helper"

class AdminTest < ActionDispatch::IntegrationTest
  include CognitoTestHelper

  setup { import_sample_content }

  def admin = bearer(access_token(groups: ["admin"]))

  def save(path, document, method: :put)
    public_send(method, path, params: { document: }, headers: admin, as: :json)
  end

  test "only admins get in" do
    get "/admin/pages"
    assert_response :unauthorized
    get "/admin/pages", headers: bearer(access_token(groups: %w[wife neia-boiz]))
    assert_response :forbidden
    get "/admin/pages", headers: admin
    assert_response :success
  end

  test "a new page stays hidden until it's published" do
    save "/admin/pages", { "title" => "Now", "slug" => "now", "sections" => [{ "_type" => "ctaBlock", "heading" => "Hi" }] }, method: :post
    assert_response :created
    page = response.parsed_body
    assert_equal "new", page["status"]
    assert page["document"]["sections"].first["_key"].present?, "list items get keys"

    get "/pages/now"
    assert_response :not_found
    get "/pages/slugs"
    assert_not_includes response.parsed_body, "now"

    get "/admin/publish", headers: admin
    assert_includes response.parsed_body["changes"].map { |c| c["title"] }, "Now"

    post "/admin/publish", headers: admin
    assert_equal "not_configured", response.parsed_body["rebuild"]
    get "/pages/now"
    assert_response :success
  end

  test "editing a published post saves a draft until Publish" do
    post_id = Post.find_by!(slug: "hello-world").uid
    get "/admin/posts/#{post_id}", headers: admin
    doc = response.parsed_body["document"].merge("title" => "Hello again")

    save "/admin/posts/#{post_id}", doc
    assert_equal "changed", response.parsed_body["status"]
    get "/posts/hello-world"
    assert_equal "Hello, world", response.parsed_body["title"], "the site still shows the live version"

    post "/admin/posts/#{post_id}/preview", params: { document: doc }, headers: admin, as: :json
    assert_equal "Hello again", response.parsed_body["title"], "the preview shows the draft"

    post "/admin/publish", headers: admin
    get "/posts/hello-world"
    assert_equal "Hello again", response.parsed_body["title"]
    assert_nil Post.find_by!(uid: post_id).draft
  end

  test "discarding a draft goes back to the live version" do
    post_id = Post.find_by!(slug: "hello-world").uid
    save "/admin/posts/#{post_id}", { "title" => "Scratch", "slug" => "hello-world" }
    post "/admin/posts/#{post_id}/discard", headers: admin
    assert_equal "published", response.parsed_body["status"]
    assert_equal "Hello, world", response.parsed_body["document"]["title"]
  end

  test "invalid edits are rejected with field errors" do
    post_id = Post.find_by!(slug: "hello-world").uid
    save "/admin/posts/#{post_id}", { "title" => "", "slug" => "Not A Slug" }
    assert_response :unprocessable_content
    assert_equal %w[slug title], response.parsed_body["errors"].keys.sort

    save "/admin/posts/#{post_id}", { "title" => "Taken", "slug" => "block-based-pages-in-angular" }
    assert_response :unprocessable_content

    save "/admin/pages", { "title" => "Bad", "slug" => "bad", "sections" => [{ "_type" => "evilBlock" }] }, method: :post
    assert_response :unprocessable_content
    assert_match "evilBlock", response.parsed_body["message"]
  end

  test "a slug claimed by another draft can't be reused" do
    first, second = Post.order(:slug).to_a
    save "/admin/posts/#{first.uid}", { "title" => "Renamed", "slug" => "fresh-slug" }
    assert_response :success
    save "/admin/posts/#{second.uid}", { "title" => "Also", "slug" => "fresh-slug" }
    assert_response :unprocessable_content
  end

  test "deleting a published page waits for Publish; a new one goes at once" do
    about = Page.find_by!(slug: "about")
    delete "/admin/pages/#{about.uid}", headers: admin
    assert_equal "deleted", response.parsed_body["status"]
    get "/pages/about"
    assert_response :success

    post "/admin/publish", headers: admin
    get "/pages/about"
    assert_response :not_found

    save "/admin/pages", { "title" => "Temp", "slug" => "temp" }, method: :post
    delete "/admin/pages/#{response.parsed_body['id']}", headers: admin
    assert_response :no_content
    assert_not Page.exists?(slug: "temp")
  end

  test "settings are drafted and published too" do
    get "/admin/settings", headers: admin
    doc = response.parsed_body["document"].merge("footerText" => "New footer")
    put "/admin/settings", params: { document: doc }, headers: admin, as: :json
    get "/settings"
    assert_not_equal "New footer", response.parsed_body["footerText"]

    post "/admin/publish", headers: admin
    get "/settings"
    assert_equal "New footer", response.parsed_body["footerText"]
  end

  test "spending plan edits apply immediately and are validated" do
    plan = { "title" => "Plan", "categories" => [{ "name" => "Food", "monthlyBudget" => 400 }], "stages" => [] }
    put "/admin/spending-plan", params: { document: plan }, headers: admin, as: :json
    assert_response :success
    assert_equal "Food", SpendingPlan.instance.categories.first["name"]
    assert SpendingPlan.instance.categories.first["_key"].present?

    put "/admin/spending-plan", params: { document: plan.merge("categories" => [{ "name" => "" }]) }, headers: admin, as: :json
    assert_response :unprocessable_content
  end

  test "uploads images by content, not by name" do
    png = png_file(30, 20)
    post "/admin/images", params: { file: Rack::Test::UploadedFile.new(png.path, "image/png") }, headers: admin
    assert_response :created
    assert_equal [30, 20], response.parsed_body.values_at("width", "height")
    assert_match %r{/images/image-\h{40}\?s=\h{32}&w=320\z}, response.parsed_body["thumbnailUrl"]

    fake = Tempfile.new(["fake", ".png"]).tap { |f| f.write("#!/bin/sh\necho hi\n"); f.flush }
    post "/admin/images", params: { file: Rack::Test::UploadedFile.new(fake.path, "image/png") }, headers: admin
    assert_response :unsupported_media_type

    get "/admin/images", headers: admin
    assert_equal 1, response.parsed_body.length
  end

  test "documents list the thumbnails of the images they use" do
    image = Image.create_from_file!(path: png_file(10, 10).path, filename: "a.png", content_type: "image/png")
    post_id = Post.find_by!(slug: "hello-world").uid
    save "/admin/posts/#{post_id}", { "title" => "Hi", "slug" => "hello-world", "coverImage" => { "asset" => { "_ref" => image.id } } }
    assert_equal [image.id], response.parsed_body["assets"].keys
  end

  test "link targets cover pages, posts and projects" do
    get "/admin/link-targets", headers: admin
    assert_equal %w[page post project], response.parsed_body.map { |t| t["type"] }.uniq.sort
  end

  test "an unreachable rebuild webhook reports a failure without losing the publish" do
    ENV["AMPLIFY_WEBHOOK_URL"] = "http://127.0.0.1:1/webhook"
    post "/admin/publish", headers: admin
    assert_response :success
    assert_equal "failed", response.parsed_body["rebuild"]
  ensure
    ENV.delete("AMPLIFY_WEBHOOK_URL")
  end
end
