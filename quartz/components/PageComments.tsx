import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { buildCommit, repoPath } from "../util/build"
import { concatenateResources } from "../util/resources"
import style from "./styles/comments.scss"
// @ts-ignore
import commentScript from "./scripts/pagecomments.inline"
// @ts-ignore
import threadScript from "./scripts/pagethreads.inline"

// Reader comments. Selecting text on a page, or the Comment button, files a
// GitHub issue through functions/api/comment.js; open ones are highlighted on
// the page they were left on, with replies and Resolve beside them. The reader
// is identified by Cloudflare Access, so nobody signs in to GitHub.
//
// The controls stay hidden until /api/comments answers, so a site deployed
// without the functions, or without their settings, shows nothing.
const PageComments: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  return (
    <div
      class={classNames(displayClass, "wiki-comment-footer")}
      data-page-path={repoPath(fileData.filePath)}
      data-page-title={fileData.frontmatter?.title}
      data-page-commit={buildCommit()}
      hidden
    >
      <button
        type="button"
        id="wiki-comment-page"
        title="Or select any text on the page to comment on that passage"
      >
        Comment
      </button>
    </div>
  )
}

PageComments.css = style
PageComments.afterDOMLoaded = concatenateResources(commentScript, threadScript)

export default (() => PageComments) satisfies QuartzComponentConstructor
