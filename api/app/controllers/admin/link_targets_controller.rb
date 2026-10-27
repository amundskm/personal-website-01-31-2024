# Everything an internal link or a project grid can point at.
class Admin::LinkTargetsController < Admin::BaseController
  def index
    targets = { "page" => Page, "post" => Post, "project" => Project }.flat_map do |type, model|
      model.where(pending_delete: false).order(:title).map do |record|
        { "id" => record.uid, "type" => type, "title" => record.title, "slug" => record.slug, "status" => record.status }
      end
    end
    render json: targets
  end
end
