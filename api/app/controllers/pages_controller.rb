class PagesController < ApplicationController
  before_action :public_cache

  # Slugs to prerender; the home page is prerendered at "/"
  def slugs
    render json: Page.live.where.not(slug: "home").order(:slug).pluck(:slug)
  end

  def show
    render json: resolver.page(Page.live.find_by!(slug: params[:slug]))
  end
end
