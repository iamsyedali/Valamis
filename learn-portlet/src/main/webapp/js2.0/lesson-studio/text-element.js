var textElementModule = slidesApp.module('TextElementModule', {
    moduleClass: GenericEditorItemModule,
    define: function(TextElementModule, slidesApp, Backbone, Marionette, $, _){

        TextElementModule.View = this.BaseView.extend({
            template: '#textElementTemplate',
            className: 'rj-element rj-text no-select',
            events: _.extend({}, this.BaseView.prototype.events, {
                'dblclick': 'initEditor',
                'blur': 'destroyEditor',
                'click  .js-item-select-liferay-article': 'selectLiferayArticle'
            }),
            initialize: function(){
                this.constructor.__super__.initialize.apply(this, arguments);
                this.model.on('change', function(model){
                    var that = this;
                    var changed_keys = _.keys(model.changedAttributes());
                    if(_.intersection(['content','fontSize'], changed_keys).length > 0){
                        _.defer(function(){
                            that.ui.content.html(that.model.get('content'));
                            that.wrapperUpdate(false);
                        });
                    }
                }, this);
                this.on('element-settings:open', this.onSettingsOpen);
            },
            updateEl: function() {
                this.constructor.__super__.updateEl.apply(this, arguments);
                if (this.editor) this.destroyEditor();
            },
            onRender: function() {
                this.constructor.__super__.onRender.apply(this, arguments);
                this.model.on('sync', function () {
                    this.destroyEditor();
                }, this);
            },
            getEditorConfig: function(){
                var view = this;
                var baseFontSize = view.editorOptions.fontSize || this.model.get('fontSize') || '16';
                baseFontSize = parseInt(baseFontSize.replace(/\D/g, ''), 10);
                return {
                    extraPlugins: 'contextmenu,table,tabletools,lineheight',
                    enterMode: CKEDITOR.ENTER_P,
                    forcePasteAsPlainText: true,
                    line_height: '0.8;1;1.25;1.5;1.75;2;3;4;5;6;7;8;9;10',
                    fontSize_sizes: _.map([9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72], function(val){
                        return val + '/' + (val / baseFontSize).toFixed(3) + 'em';
                    }).join(';'),
                    fontSize_defaultLabel: '',
                    on:{
                        focus: function(){
                            if( this.getData() == '<p>' + Valamis.language['newTextElementLabel'] + '</p>' ){
                                this.setData('');
                            }
                            view.wrapperUpdate( false );
                        },
                        blur: function(event){
                            view.destroyEditor();
                        },
                        change: function (event) {
                            view.wrapperUpdate( false );
                            if(slidesApp.isSaved)
                                slidesApp.toggleSavedState();
                        },
                        instanceReady: function(event){
                            var editor = event.editor,
                                toolbarStyles = _.find(editor.toolbar, function(item){
                                    return item.name == 'styles';
                                }),
                                toolFontSize = _.find(toolbarStyles.items, function(item){
                                    return item.name == 'fontsize';
                                });
                            Object.defineProperty(toolFontSize, 'applyChanges', {
                                value: toolFontSize.onClick
                            });
                            Object.defineProperty(toolFontSize, 'onClick', {
                                value: function(value){
                                    var selection = editor.getSelection(true),
                                        contentSelectedText = selection.getSelectedText().replace(/\n(\s*)/g, ''),
                                        contentText = editor.element.getText(),
                                        isAllSelected = contentText.length == contentSelectedText.length;
                                    if( isAllSelected ){
                                        view.content.css('font-size', value+'px');
                                        view.editorOptions.fontSize = value+'px';
                                        view.removeStyle('font-size');
                                        view.wrapperUpdate( false );
                                        //Refresh editor
                                        var editorName = view.editor.name,
                                            editorElement = view.editor.element.$;
                                        CKEDITOR.instances[editorName].destroy();
                                        view.editor = CKEDITOR.inline(editorName, view.getEditorConfig());
                                        jQueryValamis(editorElement).focus();
                                    } else {
                                        this.applyChanges(value);
                                    }
                                }
                            });
                        },
                        panelShow: function(ev){
                            var editor = ev.editor,
                                iframeContent = ev.data._.iframe.$.contentWindow.document,
                                fontSizePanel = jQueryValamis(iframeContent).find('.cke_panel_block[title="' + editor.lang.font.fontSize.panelTitle + '"]');
                            //Set base font to preview
                            if(fontSizePanel.size() > 0){
                                fontSizePanel.find('ul.cke_panel_list > li').each(function(){
                                    var value = jQueryValamis('a', this).attr('title');
                                    jQueryValamis(this).css({ fontSize: baseFontSize, lineHeight: value + 'px' });
                                });
                            }
                        }
                    }
                };
            },
            initEditor: function() {
                var currentSlide = slidesApp.getSlideModel(slidesApp.activeSlideModel.getId());
                var isLessonSummary = currentSlide.get('isLessonSummary') && _.contains(this.model.get('content'), '<span id="lesson-summary-table">');

                // do not init editor for lesson summary table
                if (!isLessonSummary) {
                    this.undelegateEvents();
                    this.$el.draggable('disable');
                    this.ui.content.get(0).contentEditable = true;
                    this.editorOptions = {};
                    this.closeItemSettings();
                    this.editor = CKEDITOR.inline(this.content[0], this.getEditorConfig());
                    this.content[0].focus();
                    this.$el.removeClass('no-select');
                    slidesApp.isEditing = true;
                    slidesApp.vent.trigger('editorModeChanged');
                }
            },
            /** Remove elements style, except the root element */
            removeStyle: function( styleName ){
                if(!slidesApp.isEditing) return;
                var editor = this.editor,
                    path = editor.elementPath();
                styleName = styleName || 'font-size';
                var elRemoveStyle = function(el, styleName){
                    var element = new CKEDITOR.dom.element(el);
                    if( element.getName() != '#text' ){
                        element.removeStyle(styleName);
                    }
                    var childNodes = el.childNodes;
                    for(var j=0; j < childNodes.length; j++){
                        elRemoveStyle(childNodes[j], styleName);
                    }
                };
                if( path.elements.length > 0 ){
                    for(var i=0; i < path.elements.length - 1; i++){
                        if( i == 0 ){//Not root element
                            var el = path.elements[i].$.nextSibling;
                            while (el) {
                                elRemoveStyle(el, styleName);
                                el = el.nextSibling;
                            }
                        }
                        path.elements[i].removeStyle(styleName);
                    }
                }
            },
            destroyEditor: function() {
                if( !this.editor ){ return; }
                this.$el.draggable('enable');
                if(this.editor && this.editor.focusManager.hasFocus) {
                    slidesApp.execute('item:focus', this);
                }
                var data = {
                    left: this.$el.position().left,
                    top: this.$el.position().top,
                    width: this.$el.width(),
                    height: this.$el.height()
                };
                this.model.set('content', this.editor.getData());
                if(this.editor) {
                    this.editor.destroy();
                    this.editor = undefined;
                }
                if(!_.isEmpty(this.editorOptions)){
                    _.extend(data, this.editorOptions);
                }
                this.content[0].contentEditable = false;
                this.$el.addClass('no-select');
                this.model.updateProperties( data );
                this.delegateEvents();
                slidesApp.isEditing = false;
                slidesApp.vent.trigger('editorModeChanged');
            },
            onSettingsOpen: function(){
                var that = this;
                var selectedValue = this.model.get('fontSize') || '16px';
                if(!this.$('.js-select-font-size')[0].selectize){
                    this.$('.js-select-font-size').selectize({
                        delimiter: ',',
                        persist: false,
                        valueField: 'value',
                        options: _.map([9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72], function(val){
                            return { value: val+'px', text: val };
                        }),
                        items: [ selectedValue ],
                        onChange: function(value){
                            if(that.model.get('fontSize') != value){
                                that.elementSettings.properties.fontSize = value;
                                that.saveSettings();
                                if (that.content.find('span').length > 0) {
                                    that.content.find('span').removeAttr('style');
                                    var content = that.content.clone();
                                    content.find('*').map(function() {
                                        $(this).removeAttr('id')
                                    });
                                    that.model.set('content', content.html());
                                }
                            }
                        }
                    });
                } else {
                    this.$('.js-select-font-size')[0].selectize.setValue(selectedValue);
                }
            },
            selectLiferayArticle: function() {
                var that = this;
                var liferayArticleModel = new Backbone.Model();
                liferayArticleModel.set('tempId', this.model.get('id') || this.model.get('tempId'));
                var AddTextArticleModalView = new AddTextArticleModal({ model: liferayArticleModel });
                valamisApp.execute('modal:show', AddTextArticleModalView);
                AddTextArticleModalView.$el.find('.js-title-edit').closest('tr').hide();

                AddTextArticleModalView.on('article:added', function (data) {
                    data = decodeURIComponent(data.replace(/\+/g, ' '));
                    that.ui.content.html(data);
                    that.elementSettings.attrs.content = data;
                    that.elementSettings.properties.width = Math.min(800, that.getContentWidth());
                    valamisApp.execute('modal:close', AddTextArticleModalView);
                    var images = that.content.find('img');
                    if(images.length > 0) {
                        that.content.find('img').last().load(function() {
                            updateAndPushAction();
                        });
                    }
                    else updateAndPushAction();
                });
                function updateAndPushAction() {
                    that.saveSettings();
                }
                this.$('.item-settings').hide();
            }
        });

        TextElementModule.CreateModel = function() {
            var model = new TextElementModule.Model( {
                'content': Valamis.language['newTextElementLabel'],
                'slideEntityType': 'text'
            });
            return model;
        }
    }
});

textElementModule.on('start', function() {
    slidesApp.execute('toolbar:item:add', {title: 'Text', label: Valamis.language['textLabel'], slideEntityType: 'text'});
});