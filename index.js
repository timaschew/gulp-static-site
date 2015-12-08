
// cheapo gulp-load-plugins
var $ = {}; [
	'front-matter',
	'map',
	'marked',
	'util',
	'filetree',
	'size'
].forEach(function(plugin) {
	$[plugin.replace('-','')] = require('gulp-' + plugin);
});

var path = require('path');
var lazypipe = require('lazypipe');

// for async for template loading
var Q = require('kew');
var fs = require('fs');
var jade = require('jade');
var File = require('vinyl');
var glob = require('glob');
var yaml = require('js-yaml');
// showing off
var archy = require('archy');
var chalk = require('chalk');

/**
 * Render the template, injecting the file into `page.file`.
 *
 * Switch templates by settings `meta.layout` on the file.
 *
 * Template variables:
 *
 * - page: Vinyl object <File ..>
 * - page.meta: Front-matter properties
 * - page.tree: Site tree
 * - page.subtree: Subtree rooted at this file
 * - page.content: Main content of the current page
 *
 * The nodes in the tree's (Treenode) have the following properties:
 *
 * - node.leaf: value at current node (Vinyl object) (may be undefined)
 * - node.parent: parent node (Treenode) (undefined for root)
 * - node.label: string label (~ path.basename(file.path))
 * - node.nodes: (empty) array of Treenodes that are children of this node
 *
 * There are also some methods on Treenodes.
 *
 * - node.is_leaf(): true if no children
 * - node.is_singleton(): true if has only one child
 * - node.is_last_child(): true if it is the last child of the parent
 *
 */

function render_tmpl() {

	// store compiled templates for great good
	var cache = {};
	var globbedFiles = glob.sync(options.baseDir + '/contents/*.yml');
	var yamlData = {};
	for (var i=0; i<globbedFiles.length; i++) {
		var foundFile = globbedFiles[i];
		var basename = path.basename(foundFile, '.yml');
		yamlData[basename] = yaml.load(fs.readFileSync(foundFile, 'utf8'))
	}

	var compile_template = function (filename)
	{
		return Q
			.fcall(function(){
				// return cached immediately
				if (cache[filename]) {
					return cache[filename];
				}

				// (asynchronously) load and compile template
				$.util.log('loading template: ' + filename);
				return Q
					.nfcall(fs.readFile, filename)
					.then(function(tmpl_content){
						// turn template in promise returning function and cache it
						var compiled = jade.compile(tmpl_content, {pretty:true, filename: filename});
						$.util.log('compiled template: ' + chalk.yellow(filename));
						return (cache[filename] = compiled);
					});
			})
			.fail(function(err){
				$.util.log('failed compiling jade template', chalk.red(err));
			});
	};

	return $.map(function(file){
		// select template
		var t = (file.frontMatter && file.frontMatter.layout) || 'default';

		// pull from cache, compile if needed
		return compile_template(options.baseDir + 'templates/' + t + '.jade')
			.then(function(compiled_template) {
				$.util.log('rendering [' + chalk.yellow(t) + '] "' +
					chalk.magenta(path.basename(file.path)) + '"');

				try {
					var locals = {
						page: file,
						contents: yamlData
					};
					var html = compiled_template(locals);
				}
				catch(err) {
					console.log('[' + chalk.red('ERR') +
						'] Failed rendering jade template\n\t' +
						chalk.red(err.message));
				}

				return new File({
					cwd: file.cwd,
					base: file.base,
					path: file.path.replace(/\.md$/, '.html'),
					contents: new Buffer(html)
				});
			})
			.fail(function(err){
				$.util.log('Failed rendering jade template', chalk.red(err));
			});
	});
}

// replace [[My Page]] with <a href='My-Page.html'>My Page</a>
var resolve_wiki_links = function() {
	return $.replace(/\[\[(.*?)\]\]/g,
		function wikiLink(match, text){
			var href = text.trim().replace(/ /g,'-') + '.html';
			return '<a href="' + href + '">' + text + '</a>';
		})
};

var extended_attributes = function(file) {
	file.path = file.path && file.path.replace(/\.md$/, '.html');
	file.basename = path.basename(file.path);
	file.shortName = file.basename && file.basename.replace(/\.html$/, '');
	file.href = file.relative
	return file;
};

var show_tree_once = function() {
	var once = false;
	return $.map(function(file) {
		if(!once && file.tree) {
			$.util.log('File tree\n' + archy(file.tree));
			once = true;
		}
		return file;
	});
};

//TODO: make it configurable
// https://github.com/wires/gulp-static-site/issues/7
var options = {};
if (!options.baseDir) options.baseDir = 'src/'

module.exports = lazypipe()
	.pipe($.map, extended_attributes)
	.pipe(require('gulp-front-matter'))
	.pipe($.marked)
////	.pipe(resolve_wiki_links)
	.pipe($.filetree)
	.pipe(show_tree_once)
	.pipe(render_tmpl)
	.pipe($.size)
