# Header navigation, footer and default SEO. There is a single row, with an
# optional draft like the documents (see Draftable).
class SiteSetting < ApplicationRecord
  include EditableDocument

  document_fields "title" => :title, "description" => :description, "footerText" => :footer_text,
                  "navigation" => :navigation, "socialLinks" => :social_links, "seo" => :seo

  def self.instance
    first_or_create!
  end

  def status = draft ? "changed" : "published"

  def editable_document = draft || to_document

  def save_draft!(doc)
    update!(draft: self.class.normalize_document(doc))
  end

  def discard_changes!
    update!(draft: nil)
  end

  def publish!
    return unless draft

    assign_document(draft)
    update!(draft: nil)
  end

  def preview(doc) = dup.assign_document(self.class.normalize_document(doc))
end
