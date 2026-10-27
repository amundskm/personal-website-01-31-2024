class PostsController < ApplicationController
  before_action :public_cache

  def index
    render json: resolver.post_cards(Post.newest_first)
  end

  def slugs
    render json: Post.order(:slug).pluck(:slug)
  end

  def show
    render json: resolver.post(Post.find_by!(slug: params[:slug]))
  end
end
