(function () {
  function supportsFlexGap() {
    var flex = document.createElement("div");
    flex.style.position = "absolute";
    flex.style.visibility = "hidden";
    flex.style.display = "flex";
    flex.style.flexDirection = "column";
    flex.style.rowGap = "1px";
    flex.appendChild(document.createElement("div"));
    flex.appendChild(document.createElement("div"));
    document.body.appendChild(flex);
    var supported = flex.scrollHeight === 1;
    document.body.removeChild(flex);
    return supported;
  }

  var root = document.documentElement;
  if (!supportsFlexGap()) root.className += " no-flex-gap";
  if (!(window.CSS && CSS.supports && CSS.supports("aspect-ratio", "1 / 1"))) {
    root.className += " no-aspect-ratio";
  }
})();
