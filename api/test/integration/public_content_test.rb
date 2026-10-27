require "test_helper"

class PublicContentTest < ActionDispatch::IntegrationTest
  setup { import_sample_content }

  test "settings resolve internal links to their slug" do
    get "/settings"
    assert_response :success
    about = response.parsed_body["navigation"].find { |link| link["label"] == "About" }
    assert_equal({ "_type" => "page", "slug" => "about" }, about["internal"])
    assert_equal %w[_key label kind path url style internal], about.keys
    assert_equal "max-age=60, public", response.headers["Cache-Control"]
  end

  test "page slugs leave out the home page" do
    get "/pages/slugs"
    assert_equal ["about"], response.parsed_body
  end

  test "home page sections get their list items" do
    get "/pages/home"
    assert_response :success
    sections = response.parsed_body["sections"].index_by { |s| s["_type"] }
    assert_equal %w[personal-website sample-project], sections["projectGridBlock"]["items"].map { |p| p["slug"] }.sort
    assert_equal "block-based-pages-in-angular", sections["postListBlock"]["items"].first["slug"]
    assert(sections["heroBlock"]["buttons"].all? { |b| b.key?("internal") })
  end

  test "posts are newest first, as cards" do
    get "/posts"
    posts = response.parsed_body
    assert_equal %w[block-based-pages-in-angular hello-world], posts.map { |p| p["slug"] }
    assert_equal %w[_id title slug excerpt publishedAt tags coverImage], posts.first.keys
  end

  test "a post includes its body" do
    get "/posts/hello-world"
    assert_response :success
    assert_equal "block", response.parsed_body["body"].first["_type"]
  end

  test "a project includes links and gallery" do
    get "/projects/personal-website"
    assert_response :success
    assert_equal %w[repoUrl liveUrl body gallery seo].to_set, response.parsed_body.keys.last(5).to_set
  end

  test "unknown slugs are 404" do
    get "/posts/nope"
    assert_response :not_found
  end

  test "image references become URLs with metadata" do
    image = Image.create_from_file!(path: png_file(40, 20).path, filename: "a.png", content_type: "image/png")
    Post.find_by!(slug: "hello-world").update!(cover_image: { "_type" => "accessibleImage", "alt" => "A",
                                                             "asset" => { "_type" => "reference", "_ref" => image.id } })
    get "/posts/hello-world"
    cover = response.parsed_body["coverImage"]
    assert_equal "A", cover["alt"]
    assert_equal "http://www.example.com/images/#{image.id}", cover["asset"]["url"]
    assert_equal({ "width" => 40, "height" => 20, "aspectRatio" => 2.0 }, cover["asset"]["metadata"]["dimensions"])
  end
end
