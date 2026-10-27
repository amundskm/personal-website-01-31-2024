require "test_helper"

class ImagesTest < ActionDispatch::IntegrationTest
  setup do
    @image = Image.create_from_file!(path: png_file(400, 200).path, filename: "a.png", content_type: "image/png")
  end

  # The usage URL the API hands the site, as a path
  def usage_path(**usage) = @image.as_asset("", **usage)["url"]

  def served_size = Vips::Image.new_from_buffer(response.body, "").then { |i| [i.width, i.height] }

  test "serves a resized, cropped WebP that can be cached forever" do
    get "#{usage_path(hotspot: { 'x' => 0.2, 'y' => 0.5 })}&w=320&h=180"
    assert_response :success
    assert_equal "image/webp", response.media_type
    assert_includes response.headers["Cache-Control"], "public"
    assert_equal [320, 180], served_size
  end

  test "keeps the aspect ratio without a height" do
    get "#{usage_path}&w=320"
    assert_equal [320, 160], served_size
  end

  test "serves the original without a width" do
    get "/images/#{@image.id}"
    assert_equal "image/png", response.media_type
    assert_includes response.headers["Content-Security-Policy"], "sandbox"
  end

  test "rejects sizes the site doesn't use" do
    get "#{usage_path}&w=321"
    assert_response :bad_request
    get "#{usage_path}&w=320&h=100"
    assert_response :bad_request
  end

  test "rejects crops and hotspots that weren't signed" do
    get "#{usage_path(hotspot: { 'x' => 0.2, 'y' => 0.5 }).sub('0.2000', '0.9000')}&w=320"
    assert_response :bad_request
    get "/images/#{@image.id}?crop=0.1,0,0,0&w=320"
    assert_response :bad_request
  end

  test "unknown images are 404" do
    get "/images/image-nope"
    assert_response :not_found
  end
end
