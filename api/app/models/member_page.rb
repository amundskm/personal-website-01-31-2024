# A members-only page. `audiences` lists the Cognito groups that may see it;
# admins see every page.
class MemberPage < ApplicationRecord
  include Document

  scope :visible_to, lambda { |groups|
    groups.include?("admin") ? all : where("audiences && ARRAY[?]::varchar[]", groups)
  }
end
