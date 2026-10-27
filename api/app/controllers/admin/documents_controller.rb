# Pages, posts, projects and members pages. Saves are drafts (see Draftable);
# Admin::PublishesController makes them live.
class Admin::DocumentsController < Admin::BaseController
  COLLECTIONS = { "pages" => Page, "posts" => Post, "projects" => Project, "member-pages" => MemberPage }.freeze
  RESOLVE = { Page => :page, Post => :post, Project => :project, MemberPage => :member_page }.freeze

  before_action :set_model
  before_action :set_record, only: %i[show update destroy discard]

  def index
    render json: @model.order(:title).map { |record| summary(record) }
  end

  def show
    render json: detail(@record)
  end

  def create
    record = @model.new(published: false)
    record.save_draft!(body_document)
    render json: detail(record), status: :created
  end

  def update
    @record.save_draft!(body_document)
    render json: detail(@record)
  end

  # Deletes a document that was never published; otherwise marks it for
  # deletion on the next Publish.
  def destroy
    @record.request_delete!
    @record.destroyed? ? head(:no_content) : render(json: detail(@record))
  end

  def discard
    @record.discard_changes!
    render json: detail(@record)
  end

  # Renders an unsaved document the way the site would (for the live preview)
  def preview
    base = params[:id].present? ? @model.find_by!(uid: params[:id]) : @model.new
    render json: preview_resolver.public_send(RESOLVE.fetch(@model), base.preview(body_document))
  end

  private

  def set_model
    @model = COLLECTIONS.fetch(params[:collection]) { raise ActiveRecord::RecordNotFound }
  end

  def set_record
    @record = @model.find_by!(uid: params[:id])
  end

  def summary(record)
    doc = record.editable_document
    { "id" => record.uid, "title" => doc["title"], "slug" => doc["slug"], "status" => record.status,
      "updatedAt" => record.updated_at.utc.iso8601 }
  end

  def detail(record)
    doc = record.editable_document
    summary(record).merge("document" => doc, "assets" => assets_in(doc))
  end
end
