# Drafts for content documents (see the AddDrafts migration):
#
# - published: the columns are live; admin saves go to `draft`
# - new (never published): saves write the columns; hidden from the site
# - pending_delete: removed on the next Publish
module Draftable
  extend ActiveSupport::Concern

  included do
    include EditableDocument

    scope :live, -> { where(published: true) }
    scope :with_changes, -> { where(published: false).or(where.not(draft: nil)).or(where(pending_delete: true)) }
  end

  def status
    if pending_delete? then "deleted"
    elsif !published? then "new"
    elsif draft then "changed"
    else "published"
    end
  end

  # What the admin edits: the draft if there is one, else the live version
  def editable_document
    draft || to_document
  end

  # Saves an edit. Validates it as if it were live (slug format, uniqueness…)
  # without changing what the site shows.
  def save_draft!(doc)
    doc = self.class.normalize_document(doc)
    assign_document(doc)
    return save! unless published?

    raise ActiveRecord::RecordInvalid, self unless valid?

    restore_attributes
    update!(draft: doc)
  end

  def request_delete!
    published? ? update!(pending_delete: true) : destroy!
  end

  def discard_changes!
    update!(draft: nil, pending_delete: false)
  end

  def publish!
    return destroy! if pending_delete?

    assign_document(draft) if draft
    self.draft = nil
    self.published = true
    save!
  end

  # An unsaved copy with `doc` applied, for previews.
  def preview(doc)
    dup.tap { |copy| copy.uid = uid }.assign_document(self.class.normalize_document(doc))
  end
end
