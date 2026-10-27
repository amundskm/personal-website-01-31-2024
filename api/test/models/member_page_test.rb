require "test_helper"

class MemberPageTest < ActiveSupport::TestCase
  setup do
    MemberPage.create!(title: "For wife", slug: "wife", audiences: ["wife"])
    MemberPage.create!(title: "For both", slug: "both", audiences: %w[wife neia-boiz])
    MemberPage.create!(title: "Admin only", slug: "admin-only", audiences: [])
  end

  def slugs_for(groups) = MemberPage.visible_to(groups).order(:slug).pluck(:slug)

  test "members see pages shared with any of their groups" do
    assert_equal %w[both], slugs_for(["neia-boiz"])
    assert_equal %w[both wife], slugs_for(%w[wife da-boiz])
  end

  test "admins see everything, including pages shared with no one" do
    assert_equal %w[admin-only both wife], slugs_for(["admin"])
  end

  test "other groups see nothing" do
    assert_empty slugs_for(["da-girls"])
  end
end
