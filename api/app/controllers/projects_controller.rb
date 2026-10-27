class ProjectsController < ApplicationController
  before_action :public_cache

  def index
    render json: resolver.project_cards(Project.live.in_display_order)
  end

  def slugs
    render json: Project.live.order(:slug).pluck(:slug)
  end

  def show
    render json: resolver.project(Project.live.find_by!(slug: params[:slug]))
  end
end
