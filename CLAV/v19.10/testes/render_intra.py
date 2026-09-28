import re,sys,json
def render(src_dir, boot):
    s=open(src_dir+'/Intra.html',encoding='utf-8').read()
    farm=re.sub(r'<!--[\s\S]*?-->','',open(src_dir+'/IntraFarmacos.html',encoding='utf-8').read())
    s=s.replace("<?!= JSON.stringify(bootParams || {}).replace(/</g, '\\\\u003c') ?>", json.dumps(boot,ensure_ascii=False).replace('<','\\u003c'))
    s=s.replace("<?!= JSON.stringify(bootParams || {}) ?>", json.dumps(boot,ensure_ascii=False))
    s=s.replace("<?!= include('IntraFarmacos').replace(/<!--[\\s\\S]*?-->/g, '') ?>", farm).replace("<?!= include('IntraFarmacos') ?>", farm)
    assert '<?' not in s, 'unrendered scriptlet remains'
    return s
if __name__=='__main__':
    out=render(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv)>2 else {"caso":"ATD-TESTE","slot":"1","modo":"completo","webAppUrl":"https://script.google.com/macros/s/EXEMPLO/exec","versao":"teste"})
    open(sys.argv[3] if len(sys.argv)>3 else 'intra_rendered.html','w',encoding='utf-8').write(out)
    print('rendered', len(out))
