# Members-only pages, filtered by the caller's Cognito groups. A page that
# isn't shared with the caller is a 404, the same as one that doesn't exist.
class Members::PagesController < ApplicationController
  include CognitoAuthentication

  before_action :require_any_group!

  def index
    render json: resolver.member_page_summaries(visible_pages.order(:title))
  end

  def show
    render json: resolver.member_page(visible_pages.find_by!(slug: params[:slug]))
  end

  private

  def visible_pages = MemberPage.visible_to(current_groups)

  def require_any_group!
    render json: { message: "Your account has no permissions yet." }, status: :forbidden if current_groups.empty?
  end
end
