# Publish: applies every draft, deletion and new document, then rebuilds the
# static site through the Amplify webhook.
class Admin::PublishesController < Admin::BaseController
  MODELS = [Page, Post, Project, MemberPage].freeze

  # What Publish would change
  def show
    render json: { "changes" => changes, "rebuildConfigured" => SiteRebuild.configured? }
  end

  def create
    published = changes
    ActiveRecord::Base.transaction do
      MODELS.each { |model| model.with_changes.find_each(&:publish!) }
      SiteSetting.instance.publish!
    end
    render json: { "published" => published, "rebuild" => SiteRebuild.trigger }
  end

  private

  def changes
    documents = MODELS.flat_map do |model|
      model.with_changes.order(:title).map do |record|
        { "collection" => Admin::DocumentsController::COLLECTIONS.key(model), "id" => record.uid,
          "title" => record.editable_document["title"], "status" => record.status }
      end
    end
    return documents unless SiteSetting.instance.draft

    documents << { "collection" => "settings", "id" => nil, "title" => "Site settings", "status" => "changed" }
  end
end
